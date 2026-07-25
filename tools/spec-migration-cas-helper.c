#define _DARWIN_C_SOURCE
#define _GNU_SOURCE

#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#if defined(__linux__)
#include <sys/syscall.h>
#ifndef RENAME_NOREPLACE
#define RENAME_NOREPLACE (1U << 0)
#endif
#elif defined(__APPLE__)
#include <sys/attr.h>
#else
#error "spec migration CAS helper only supports Linux and macOS"
#endif

#ifndef O_CLOEXEC
#define O_CLOEXEC 0
#endif

#ifndef O_NOFOLLOW
#define O_NOFOLLOW 0
#endif

enum {
  ROOT_FD = 3,
  EXPECTED_FD = 4,
  OBSERVED_FD = 5,
};

static int managed_parent_fd = -1;
static int managed_recovery_fd = -1;
static int managed_lock_fd = -1;
static int managed_temporary_fd = -1;
static int managed_snapshot_fd = -1;
static const char *managed_target_name = NULL;
static const char *managed_temporary_name = NULL;
static const char *managed_snapshot_name = NULL;
static const char *managed_quarantine_name = NULL;
static bool managed_original_moved = false;
static bool managed_keep_snapshot = false;
static bool managed_keep_quarantine = false;
static bool managed_success = false;
static bool managed_cleanup_complete = false;
static bool managed_lock_identity_valid = false;
static dev_t managed_lock_dev;
static ino_t managed_lock_ino;

static bool owned_lock_matches(void) {
  if (managed_lock_fd == -1 || managed_recovery_fd == -1
      || !managed_lock_identity_valid) return false;
  struct stat current;
  return fstatat(
    managed_recovery_fd,
    "spec-application.lock",
    &current,
    AT_SYMLINK_NOFOLLOW
  ) == 0
    && S_ISREG(current.st_mode)
    && current.st_dev == managed_lock_dev
    && current.st_ino == managed_lock_ino;
}

static void cleanup_resources(void) {
  if (managed_cleanup_complete) return;
  managed_cleanup_complete = true;
  if (managed_temporary_fd != -1) close(managed_temporary_fd);
  if (managed_snapshot_fd != -1) close(managed_snapshot_fd);
  if (managed_parent_fd != -1 && managed_recovery_fd != -1
      && !managed_success && managed_original_moved
      && managed_target_name != NULL && managed_quarantine_name != NULL) {
    struct stat target_info;
    if (fstatat(
      managed_parent_fd,
      managed_target_name,
      &target_info,
      AT_SYMLINK_NOFOLLOW
    ) == -1 && errno == ENOENT) {
      if (linkat(
        managed_recovery_fd,
        managed_quarantine_name,
        managed_parent_fd,
        managed_target_name,
        0
      ) == 0 && unlinkat(
        managed_recovery_fd,
        managed_quarantine_name,
        0
      ) == 0) {
        managed_original_moved = false;
        managed_keep_snapshot = true;
        managed_keep_quarantine = false;
      }
    }
  }
  if (managed_recovery_fd != -1) {
    if (managed_temporary_name != NULL) {
      unlinkat(managed_recovery_fd, managed_temporary_name, 0);
    }
    if (!managed_keep_snapshot && managed_snapshot_name != NULL) {
      unlinkat(managed_recovery_fd, managed_snapshot_name, 0);
    }
    if (!managed_keep_quarantine && managed_quarantine_name != NULL) {
      unlinkat(managed_recovery_fd, managed_quarantine_name, 0);
    }
    if (managed_lock_fd != -1) {
      close(managed_lock_fd);
      managed_lock_fd = -1;
      if (owned_lock_matches()) {
        unlinkat(managed_recovery_fd, "spec-application.lock", 0);
      } else if (managed_lock_identity_valid) {
        struct stat current;
        if (fstatat(
          managed_recovery_fd,
          "spec-application.lock",
          &current,
          AT_SYMLINK_NOFOLLOW
        ) == 0 && current.st_dev == managed_lock_dev && current.st_ino == managed_lock_ino) {
          unlinkat(managed_recovery_fd, "spec-application.lock", 0);
        }
      }
    }
  }
  if (managed_parent_fd != -1) close(managed_parent_fd);
  if (managed_recovery_fd != -1) close(managed_recovery_fd);
}

static void fail(const char *format, ...) {
  va_list args;
  va_start(args, format);
  fputs("ERROR ", stdout);
  vfprintf(stdout, format, args);
  fputc('\n', stdout);
  fflush(stdout);
  va_end(args);
  exit(1);
}

static void require_owned_lock(void) {
  if (!owned_lock_matches()) fail("owner lock identity changed");
}

static void release_owned_lock(void) {
  require_owned_lock();
  if (unlinkat(managed_recovery_fd, "spec-application.lock", 0) == -1) {
    fail("cannot release owner lock: %s", strerror(errno));
  }
  close(managed_lock_fd);
  managed_lock_fd = -1;
  managed_lock_identity_valid = false;
}

static void require_safe_name(const char *value, const char *label) {
  if (value[0] == '\0' || strcmp(value, ".") == 0 || strcmp(value, "..") == 0
      || strchr(value, '/') != NULL) {
    fail("%s is not a safe basename", label);
  }
}

static int duplicate_fd(int fd) {
  int result = fcntl(fd, F_DUPFD_CLOEXEC, 10);
  if (result == -1) fail("cannot duplicate fd: %s", strerror(errno));
  return result;
}

static int open_directory_beneath(int root_fd, const char *relative_path, bool create) {
  if (strcmp(relative_path, ".") == 0) return duplicate_fd(root_fd);
  if (relative_path[0] == '/' || relative_path[0] == '\0') {
    fail("directory path must be a non-empty relative path");
  }
  char *copy = strdup(relative_path);
  if (copy == NULL) fail("cannot allocate directory path");
  int current = duplicate_fd(root_fd);
  char *save = NULL;
  for (char *segment = strtok_r(copy, "/", &save);
       segment != NULL;
       segment = strtok_r(NULL, "/", &save)) {
    require_safe_name(segment, "directory segment");
    if (create && mkdirat(current, segment, 0700) == -1 && errno != EEXIST) {
      int saved = errno;
      close(current);
      free(copy);
      fail("cannot create trusted directory segment: %s", strerror(saved));
    }
    int next = openat(current, segment, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (next == -1) {
      int saved = errno;
      close(current);
      free(copy);
      fail("cannot open trusted directory segment: %s", strerror(saved));
    }
    close(current);
    current = next;
  }
  free(copy);
  return current;
}

static unsigned long long parse_identity(const char *value, const char *label) {
  errno = 0;
  char *end = NULL;
  unsigned long long parsed = strtoull(value, &end, 10);
  if (errno != 0 || end == value || *end != '\0') fail("invalid %s", label);
  return parsed;
}

static void require_identity(
  int fd,
  unsigned long long expected_dev,
  unsigned long long expected_ino,
  const char *label
) {
  struct stat info;
  if (fstat(fd, &info) == -1) fail("cannot stat %s: %s", label, strerror(errno));
  if ((unsigned long long)info.st_dev != expected_dev
      || (unsigned long long)info.st_ino != expected_ino) {
    fail("%s identity changed", label);
  }
}

static void require_regular_identity(
  int directory_fd,
  const char *name,
  unsigned long long expected_dev,
  unsigned long long expected_ino,
  const char *label
) {
  struct stat info;
  if (fstatat(directory_fd, name, &info, AT_SYMLINK_NOFOLLOW) == -1) {
    fail("cannot stat %s: %s", label, strerror(errno));
  }
  if (!S_ISREG(info.st_mode)
      || (unsigned long long)info.st_dev != expected_dev
      || (unsigned long long)info.st_ino != expected_ino) {
    fail("%s identity changed", label);
  }
}

static bool file_equals_fd(int file_fd, int content_fd) {
  if (lseek(file_fd, 0, SEEK_SET) == -1 || lseek(content_fd, 0, SEEK_SET) == -1) {
    fail("cannot seek CAS content: %s", strerror(errno));
  }
  unsigned char left[16384];
  unsigned char right[16384];
  for (;;) {
    ssize_t left_size = read(file_fd, left, sizeof(left));
    if (left_size == -1) fail("cannot read target content: %s", strerror(errno));
    ssize_t right_size = read(content_fd, right, sizeof(right));
    if (right_size == -1) fail("cannot read expected content: %s", strerror(errno));
    if (left_size != right_size) return false;
    if (left_size == 0) return true;
    if (memcmp(left, right, (size_t)left_size) != 0) return false;
  }
}

static void copy_fd(int source_fd, int target_fd) {
  if (lseek(source_fd, 0, SEEK_SET) == -1) {
    fail("cannot seek expected content: %s", strerror(errno));
  }
  unsigned char buffer[16384];
  for (;;) {
    ssize_t size = read(source_fd, buffer, sizeof(buffer));
    if (size == -1) fail("cannot read expected content: %s", strerror(errno));
    if (size == 0) break;
    ssize_t offset = 0;
    while (offset < size) {
      ssize_t written = write(target_fd, buffer + offset, (size_t)(size - offset));
      if (written == -1) fail("cannot write durable temporary: %s", strerror(errno));
      offset += written;
    }
  }
  if (fsync(target_fd) == -1) fail("cannot sync durable temporary: %s", strerror(errno));
}

static int rename_no_replace(
  int source_directory_fd,
  const char *source,
  int target_directory_fd,
  const char *target
) {
#if defined(__APPLE__)
  return renameatx_np(
    source_directory_fd,
    source,
    target_directory_fd,
    target,
    RENAME_EXCL
  );
#elif defined(__linux__)
  return (int)syscall(
    SYS_renameat2,
    source_directory_fd,
    source,
    target_directory_fd,
    target,
    RENAME_NOREPLACE
  );
#endif
}

static void wait_for_continue(const char *stage) {
  printf("%s\n", stage);
  fflush(stdout);
  char command[32];
  if (fgets(command, sizeof(command), stdin) == NULL || strcmp(command, "CONTINUE\n") != 0) {
    fail("controller aborted at %s", stage);
  }
}

static void require_path_identity(
  const char *relative_path,
  unsigned long long expected_dev,
  unsigned long long expected_ino,
  const char *label
) {
  int current = open_directory_beneath(ROOT_FD, relative_path, false);
  require_identity(current, expected_dev, expected_ino, label);
  close(current);
}

int main(int argc, char **argv) {
  if (atexit(cleanup_resources) != 0) {
    fputs("ERROR cannot install cleanup handler\n", stdout);
    return 1;
  }
  if (argc != 15) {
    fail("usage: helper target-parent recovery target temp snapshot quarantine root-dev root-ino parent-dev parent-ino recovery-dev recovery-ino target-dev target-ino");
  }
  const char *target_parent_path = argv[1];
  const char *recovery_path = argv[2];
  const char *target_name = argv[3];
  const char *temporary_name = argv[4];
  const char *snapshot_name = argv[5];
  const char *quarantine_name = argv[6];
  require_safe_name(target_name, "target name");
  require_safe_name(temporary_name, "temporary name");
  require_safe_name(snapshot_name, "snapshot name");
  require_safe_name(quarantine_name, "quarantine name");
  managed_target_name = target_name;
  managed_temporary_name = temporary_name;
  managed_snapshot_name = snapshot_name;
  managed_quarantine_name = quarantine_name;

  unsigned long long root_dev = parse_identity(argv[7], "root dev");
  unsigned long long root_ino = parse_identity(argv[8], "root ino");
  unsigned long long parent_dev = parse_identity(argv[9], "parent dev");
  unsigned long long parent_ino = parse_identity(argv[10], "parent ino");
  unsigned long long recovery_dev = parse_identity(argv[11], "recovery dev");
  unsigned long long recovery_ino = parse_identity(argv[12], "recovery ino");
  unsigned long long target_dev = parse_identity(argv[13], "target dev");
  unsigned long long target_ino = parse_identity(argv[14], "target ino");

  require_identity(ROOT_FD, root_dev, root_ino, "repository root");
  managed_parent_fd = open_directory_beneath(ROOT_FD, target_parent_path, false);
  managed_recovery_fd = open_directory_beneath(ROOT_FD, recovery_path, false);
  require_identity(managed_parent_fd, parent_dev, parent_ino, "target parent");
  require_identity(managed_recovery_fd, recovery_dev, recovery_ino, "recovery directory");

  managed_lock_fd = openat(
    managed_recovery_fd,
    "spec-application.lock",
    O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC,
    0600
  );
  if (managed_lock_fd == -1) {
    if (errno == EEXIST) fail("owner lock already exists");
    fail("cannot acquire owner lock: %s", strerror(errno));
  }
  dprintf(managed_lock_fd, "{\"version\":1,\"pid\":%ld}\n", (long)getpid());
  if (fsync(managed_lock_fd) == -1) fail("cannot sync owner lock: %s", strerror(errno));
  struct stat lock_info;
  if (fstat(managed_lock_fd, &lock_info) == -1 || !S_ISREG(lock_info.st_mode)) {
    fail("cannot bind owner lock identity: %s", strerror(errno));
  }
  managed_lock_dev = lock_info.st_dev;
  managed_lock_ino = lock_info.st_ino;
  managed_lock_identity_valid = true;

  managed_temporary_fd = openat(
    managed_recovery_fd,
    temporary_name,
    O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC,
    0644
  );
  if (managed_temporary_fd == -1) {
    fail("cannot create durable temporary: %s", strerror(errno));
  }
  copy_fd(EXPECTED_FD, managed_temporary_fd);
  close(managed_temporary_fd);
  managed_temporary_fd = -1;

  managed_snapshot_fd = openat(
    managed_recovery_fd,
    snapshot_name,
    O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC,
    0644
  );
  if (managed_snapshot_fd == -1) {
    fail("cannot create observed recovery snapshot: %s", strerror(errno));
  }
  copy_fd(OBSERVED_FD, managed_snapshot_fd);
  close(managed_snapshot_fd);
  managed_snapshot_fd = -1;

  wait_for_continue("READY");
  require_owned_lock();
  require_identity(ROOT_FD, root_dev, root_ino, "repository root");
  require_identity(managed_parent_fd, parent_dev, parent_ino, "target parent");
  require_identity(managed_recovery_fd, recovery_dev, recovery_ino, "recovery directory");
  require_path_identity(target_parent_path, parent_dev, parent_ino, "target parent path");
  require_path_identity(recovery_path, recovery_dev, recovery_ino, "recovery directory path");

  int target_fd = openat(managed_parent_fd, target_name, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
  if (target_fd == -1) fail("cannot open target file: %s", strerror(errno));
  struct stat target_info;
  if (fstat(target_fd, &target_info) == -1 || !S_ISREG(target_info.st_mode)) {
    close(target_fd);
    fail("target is not an ordinary file");
  }
  if ((unsigned long long)target_info.st_dev != target_dev
      || (unsigned long long)target_info.st_ino != target_ino) {
    close(target_fd);
    fail("target file identity changed");
  }
  if (file_equals_fd(target_fd, EXPECTED_FD)) {
    close(target_fd);
    release_owned_lock();
    puts("RESULT no-op");
    fflush(stdout);
    managed_success = true;
    cleanup_resources();
    return 0;
  }
  if (!file_equals_fd(target_fd, OBSERVED_FD)) {
    close(target_fd);
    fail("target content drifted before commit");
  }
  close(target_fd);

  wait_for_continue("MOVING");
  require_owned_lock();
  if (rename_no_replace(
    managed_parent_fd,
    target_name,
    managed_recovery_fd,
    quarantine_name
  ) == -1) {
    fail("cannot move original without replacement: %s", strerror(errno));
  }
  managed_original_moved = true;
  managed_keep_snapshot = true;
  managed_keep_quarantine = true;
  require_regular_identity(
    managed_recovery_fd,
    quarantine_name,
    target_dev,
    target_ino,
    "quarantined original"
  );
  int quarantined_fd = openat(
    managed_recovery_fd,
    quarantine_name,
    O_RDONLY | O_NOFOLLOW | O_CLOEXEC
  );
  if (quarantined_fd == -1 || !file_equals_fd(quarantined_fd, OBSERVED_FD)) {
    if (quarantined_fd != -1) close(quarantined_fd);
    fail("target content drifted at rename linearization point");
  }
  close(quarantined_fd);

  wait_for_continue("MOVED");
  require_owned_lock();
  require_identity(ROOT_FD, root_dev, root_ino, "repository root");
  require_identity(managed_parent_fd, parent_dev, parent_ino, "target parent");
  require_identity(managed_recovery_fd, recovery_dev, recovery_ino, "recovery directory");
  require_path_identity(target_parent_path, parent_dev, parent_ino, "target parent path");
  require_path_identity(recovery_path, recovery_dev, recovery_ino, "recovery directory path");

  wait_for_continue("PUBLISHING");
  require_owned_lock();
  if (linkat(
    managed_recovery_fd,
    temporary_name,
    managed_parent_fd,
    target_name,
    0
  ) == -1) {
    if (errno == EEXIST) fail("target path occupied during no-replace publish");
    fail("cannot publish expected content without replacement: %s", strerror(errno));
  }
  struct stat temporary_info;
  if (fstatat(
    managed_recovery_fd,
    temporary_name,
    &temporary_info,
    AT_SYMLINK_NOFOLLOW
  ) == -1) {
    fail("cannot stat durable temporary: %s", strerror(errno));
  }
  require_regular_identity(
    managed_parent_fd,
    target_name,
    (unsigned long long)temporary_info.st_dev,
    (unsigned long long)temporary_info.st_ino,
    "published target"
  );
  int published_fd = openat(
    managed_parent_fd,
    target_name,
    O_RDONLY | O_NOFOLLOW | O_CLOEXEC
  );
  if (published_fd == -1 || !file_equals_fd(published_fd, EXPECTED_FD)) {
    if (published_fd != -1) close(published_fd);
    fail("published content does not match expected bytes");
  }
  close(published_fd);
  require_owned_lock();
  if (fsync(managed_parent_fd) == -1 || fsync(managed_recovery_fd) == -1) {
    fail("cannot sync CAS directories: %s", strerror(errno));
  }
  if (unlinkat(managed_recovery_fd, temporary_name, 0) == -1) {
    fail("cannot remove durable temporary: %s", strerror(errno));
  }
  if (unlinkat(managed_recovery_fd, quarantine_name, 0) == -1) {
    fail("cannot retire quarantined original inode: %s", strerror(errno));
  }
  managed_original_moved = false;
  managed_keep_quarantine = false;
  release_owned_lock();
  puts("RESULT changed");
  fflush(stdout);
  managed_success = true;
  cleanup_resources();
  return 0;
}
