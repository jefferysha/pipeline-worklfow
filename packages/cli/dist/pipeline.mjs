#!/usr/bin/env node
import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/commander/lib/error.js
var require_error = __commonJS({
  "node_modules/commander/lib/error.js"(exports) {
    var CommanderError2 = class extends Error {
      /**
       * Constructs the CommanderError class
       * @param {number} exitCode suggested exit code which could be used with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       */
      constructor(exitCode, code, message) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
        this.code = code;
        this.exitCode = exitCode;
        this.nestedError = void 0;
      }
    };
    var InvalidArgumentError2 = class extends CommanderError2 {
      /**
       * Constructs the InvalidArgumentError class
       * @param {string} [message] explanation of why argument is invalid
       */
      constructor(message) {
        super(1, "commander.invalidArgument", message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
      }
    };
    exports.CommanderError = CommanderError2;
    exports.InvalidArgumentError = InvalidArgumentError2;
  }
});

// node_modules/commander/lib/argument.js
var require_argument = __commonJS({
  "node_modules/commander/lib/argument.js"(exports) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Argument2 = class {
      /**
       * Initialize a new command argument with the given name and description.
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @param {string} name
       * @param {string} [description]
       */
      constructor(name2, description) {
        this.description = description || "";
        this.variadic = false;
        this.parseArg = void 0;
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.argChoices = void 0;
        switch (name2[0]) {
          case "<":
            this.required = true;
            this._name = name2.slice(1, -1);
            break;
          case "[":
            this.required = false;
            this._name = name2.slice(1, -1);
            break;
          default:
            this.required = true;
            this._name = name2;
            break;
        }
        if (this._name.length > 3 && this._name.slice(-3) === "...") {
          this.variadic = true;
          this._name = this._name.slice(0, -3);
        }
      }
      /**
       * Return argument name.
       *
       * @return {string}
       */
      name() {
        return this._name;
      }
      /**
       * @package
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Argument}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Set the custom handler for processing CLI command arguments into argument values.
       *
       * @param {Function} [fn]
       * @return {Argument}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Only allow argument value to be one of choices.
       *
       * @param {string[]} values
       * @return {Argument}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Make argument required.
       *
       * @returns {Argument}
       */
      argRequired() {
        this.required = true;
        return this;
      }
      /**
       * Make argument optional.
       *
       * @returns {Argument}
       */
      argOptional() {
        this.required = false;
        return this;
      }
    };
    function humanReadableArgName(arg) {
      const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
      return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
    }
    exports.Argument = Argument2;
    exports.humanReadableArgName = humanReadableArgName;
  }
});

// node_modules/commander/lib/help.js
var require_help = __commonJS({
  "node_modules/commander/lib/help.js"(exports) {
    var { humanReadableArgName } = require_argument();
    var Help2 = class {
      constructor() {
        this.helpWidth = void 0;
        this.sortSubcommands = false;
        this.sortOptions = false;
        this.showGlobalOptions = false;
      }
      /**
       * Get an array of the visible subcommands. Includes a placeholder for the implicit help command, if there is one.
       *
       * @param {Command} cmd
       * @returns {Command[]}
       */
      visibleCommands(cmd) {
        const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
        const helpCommand = cmd._getHelpCommand();
        if (helpCommand && !helpCommand._hidden) {
          visibleCommands.push(helpCommand);
        }
        if (this.sortSubcommands) {
          visibleCommands.sort((a, b) => {
            return a.name().localeCompare(b.name());
          });
        }
        return visibleCommands;
      }
      /**
       * Compare options for sort.
       *
       * @param {Option} a
       * @param {Option} b
       * @returns {number}
       */
      compareOptions(a, b) {
        const getSortKey = (option) => {
          return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
        };
        return getSortKey(a).localeCompare(getSortKey(b));
      }
      /**
       * Get an array of the visible options. Includes a placeholder for the implicit help option, if there is one.
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleOptions(cmd) {
        const visibleOptions = cmd.options.filter((option) => !option.hidden);
        const helpOption = cmd._getHelpOption();
        if (helpOption && !helpOption.hidden) {
          const removeShort = helpOption.short && cmd._findOption(helpOption.short);
          const removeLong = helpOption.long && cmd._findOption(helpOption.long);
          if (!removeShort && !removeLong) {
            visibleOptions.push(helpOption);
          } else if (helpOption.long && !removeLong) {
            visibleOptions.push(
              cmd.createOption(helpOption.long, helpOption.description)
            );
          } else if (helpOption.short && !removeShort) {
            visibleOptions.push(
              cmd.createOption(helpOption.short, helpOption.description)
            );
          }
        }
        if (this.sortOptions) {
          visibleOptions.sort(this.compareOptions);
        }
        return visibleOptions;
      }
      /**
       * Get an array of the visible global options. (Not including help.)
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleGlobalOptions(cmd) {
        if (!this.showGlobalOptions) return [];
        const globalOptions = [];
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          const visibleOptions = ancestorCmd.options.filter(
            (option) => !option.hidden
          );
          globalOptions.push(...visibleOptions);
        }
        if (this.sortOptions) {
          globalOptions.sort(this.compareOptions);
        }
        return globalOptions;
      }
      /**
       * Get an array of the arguments if any have a description.
       *
       * @param {Command} cmd
       * @returns {Argument[]}
       */
      visibleArguments(cmd) {
        if (cmd._argsDescription) {
          cmd.registeredArguments.forEach((argument) => {
            argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
          });
        }
        if (cmd.registeredArguments.find((argument) => argument.description)) {
          return cmd.registeredArguments;
        }
        return [];
      }
      /**
       * Get the command term to show in the list of subcommands.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandTerm(cmd) {
        const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
        return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + // simplistic check for non-help option
        (args ? " " + args : "");
      }
      /**
       * Get the option term to show in the list of options.
       *
       * @param {Option} option
       * @returns {string}
       */
      optionTerm(option) {
        return option.flags;
      }
      /**
       * Get the argument term to show in the list of arguments.
       *
       * @param {Argument} argument
       * @returns {string}
       */
      argumentTerm(argument) {
        return argument.name();
      }
      /**
       * Get the longest command term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestSubcommandTermLength(cmd, helper) {
        return helper.visibleCommands(cmd).reduce((max, command) => {
          return Math.max(max, helper.subcommandTerm(command).length);
        }, 0);
      }
      /**
       * Get the longest option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestOptionTermLength(cmd, helper) {
        return helper.visibleOptions(cmd).reduce((max, option) => {
          return Math.max(max, helper.optionTerm(option).length);
        }, 0);
      }
      /**
       * Get the longest global option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestGlobalOptionTermLength(cmd, helper) {
        return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
          return Math.max(max, helper.optionTerm(option).length);
        }, 0);
      }
      /**
       * Get the longest argument term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestArgumentTermLength(cmd, helper) {
        return helper.visibleArguments(cmd).reduce((max, argument) => {
          return Math.max(max, helper.argumentTerm(argument).length);
        }, 0);
      }
      /**
       * Get the command usage to be displayed at the top of the built-in help.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandUsage(cmd) {
        let cmdName = cmd._name;
        if (cmd._aliases[0]) {
          cmdName = cmdName + "|" + cmd._aliases[0];
        }
        let ancestorCmdNames = "";
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
        }
        return ancestorCmdNames + cmdName + " " + cmd.usage();
      }
      /**
       * Get the description for the command.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandDescription(cmd) {
        return cmd.description();
      }
      /**
       * Get the subcommand summary to show in the list of subcommands.
       * (Fallback to description for backwards compatibility.)
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandDescription(cmd) {
        return cmd.summary() || cmd.description();
      }
      /**
       * Get the option description to show in the list of options.
       *
       * @param {Option} option
       * @return {string}
       */
      optionDescription(option) {
        const extraInfo = [];
        if (option.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (option.defaultValue !== void 0) {
          const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
          if (showDefault) {
            extraInfo.push(
              `default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`
            );
          }
        }
        if (option.presetArg !== void 0 && option.optional) {
          extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
        }
        if (option.envVar !== void 0) {
          extraInfo.push(`env: ${option.envVar}`);
        }
        if (extraInfo.length > 0) {
          return `${option.description} (${extraInfo.join(", ")})`;
        }
        return option.description;
      }
      /**
       * Get the argument description to show in the list of arguments.
       *
       * @param {Argument} argument
       * @return {string}
       */
      argumentDescription(argument) {
        const extraInfo = [];
        if (argument.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (argument.defaultValue !== void 0) {
          extraInfo.push(
            `default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`
          );
        }
        if (extraInfo.length > 0) {
          const extraDescripton = `(${extraInfo.join(", ")})`;
          if (argument.description) {
            return `${argument.description} ${extraDescripton}`;
          }
          return extraDescripton;
        }
        return argument.description;
      }
      /**
       * Generate the built-in help text.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {string}
       */
      formatHelp(cmd, helper) {
        const termWidth = helper.padWidth(cmd, helper);
        const helpWidth = helper.helpWidth || 80;
        const itemIndentWidth = 2;
        const itemSeparatorWidth = 2;
        function formatItem(term, description) {
          if (description) {
            const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
            return helper.wrap(
              fullText,
              helpWidth - itemIndentWidth,
              termWidth + itemSeparatorWidth
            );
          }
          return term;
        }
        function formatList(textArray) {
          return textArray.join("\n").replace(/^/gm, " ".repeat(itemIndentWidth));
        }
        let output = [`Usage: ${helper.commandUsage(cmd)}`, ""];
        const commandDescription = helper.commandDescription(cmd);
        if (commandDescription.length > 0) {
          output = output.concat([
            helper.wrap(commandDescription, helpWidth, 0),
            ""
          ]);
        }
        const argumentList = helper.visibleArguments(cmd).map((argument) => {
          return formatItem(
            helper.argumentTerm(argument),
            helper.argumentDescription(argument)
          );
        });
        if (argumentList.length > 0) {
          output = output.concat(["Arguments:", formatList(argumentList), ""]);
        }
        const optionList = helper.visibleOptions(cmd).map((option) => {
          return formatItem(
            helper.optionTerm(option),
            helper.optionDescription(option)
          );
        });
        if (optionList.length > 0) {
          output = output.concat(["Options:", formatList(optionList), ""]);
        }
        if (this.showGlobalOptions) {
          const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
            return formatItem(
              helper.optionTerm(option),
              helper.optionDescription(option)
            );
          });
          if (globalOptionList.length > 0) {
            output = output.concat([
              "Global Options:",
              formatList(globalOptionList),
              ""
            ]);
          }
        }
        const commandList = helper.visibleCommands(cmd).map((cmd2) => {
          return formatItem(
            helper.subcommandTerm(cmd2),
            helper.subcommandDescription(cmd2)
          );
        });
        if (commandList.length > 0) {
          output = output.concat(["Commands:", formatList(commandList), ""]);
        }
        return output.join("\n");
      }
      /**
       * Calculate the pad width from the maximum term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      padWidth(cmd, helper) {
        return Math.max(
          helper.longestOptionTermLength(cmd, helper),
          helper.longestGlobalOptionTermLength(cmd, helper),
          helper.longestSubcommandTermLength(cmd, helper),
          helper.longestArgumentTermLength(cmd, helper)
        );
      }
      /**
       * Wrap the given string to width characters per line, with lines after the first indented.
       * Do not wrap if insufficient room for wrapping (minColumnWidth), or string is manually formatted.
       *
       * @param {string} str
       * @param {number} width
       * @param {number} indent
       * @param {number} [minColumnWidth=40]
       * @return {string}
       *
       */
      wrap(str2, width, indent, minColumnWidth = 40) {
        const indents = " \\f\\t\\v\xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF";
        const manualIndent = new RegExp(`[\\n][${indents}]+`);
        if (str2.match(manualIndent)) return str2;
        const columnWidth = width - indent;
        if (columnWidth < minColumnWidth) return str2;
        const leadingStr = str2.slice(0, indent);
        const columnText = str2.slice(indent).replace("\r\n", "\n");
        const indentString = " ".repeat(indent);
        const zeroWidthSpace = "\u200B";
        const breaks = `\\s${zeroWidthSpace}`;
        const regex = new RegExp(
          `
|.{1,${columnWidth - 1}}([${breaks}]|$)|[^${breaks}]+?([${breaks}]|$)`,
          "g"
        );
        const lines = columnText.match(regex) || [];
        return leadingStr + lines.map((line, i) => {
          if (line === "\n") return "";
          return (i > 0 ? indentString : "") + line.trimEnd();
        }).join("\n");
      }
    };
    exports.Help = Help2;
  }
});

// node_modules/commander/lib/option.js
var require_option = __commonJS({
  "node_modules/commander/lib/option.js"(exports) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Option2 = class {
      /**
       * Initialize a new `Option` with the given `flags` and `description`.
       *
       * @param {string} flags
       * @param {string} [description]
       */
      constructor(flags, description) {
        this.flags = flags;
        this.description = description || "";
        this.required = flags.includes("<");
        this.optional = flags.includes("[");
        this.variadic = /\w\.\.\.[>\]]$/.test(flags);
        this.mandatory = false;
        const optionFlags = splitOptionFlags(flags);
        this.short = optionFlags.shortFlag;
        this.long = optionFlags.longFlag;
        this.negate = false;
        if (this.long) {
          this.negate = this.long.startsWith("--no-");
        }
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.presetArg = void 0;
        this.envVar = void 0;
        this.parseArg = void 0;
        this.hidden = false;
        this.argChoices = void 0;
        this.conflictsWith = [];
        this.implied = void 0;
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Option}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Preset to use when option used without option-argument, especially optional but also boolean and negated.
       * The custom processing (parseArg) is called.
       *
       * @example
       * new Option('--color').default('GREYSCALE').preset('RGB');
       * new Option('--donate [amount]').preset('20').argParser(parseFloat);
       *
       * @param {*} arg
       * @return {Option}
       */
      preset(arg) {
        this.presetArg = arg;
        return this;
      }
      /**
       * Add option name(s) that conflict with this option.
       * An error will be displayed if conflicting options are found during parsing.
       *
       * @example
       * new Option('--rgb').conflicts('cmyk');
       * new Option('--js').conflicts(['ts', 'jsx']);
       *
       * @param {(string | string[])} names
       * @return {Option}
       */
      conflicts(names) {
        this.conflictsWith = this.conflictsWith.concat(names);
        return this;
      }
      /**
       * Specify implied option values for when this option is set and the implied options are not.
       *
       * The custom processing (parseArg) is not called on the implied values.
       *
       * @example
       * program
       *   .addOption(new Option('--log', 'write logging information to file'))
       *   .addOption(new Option('--trace', 'log extra details').implies({ log: 'trace.txt' }));
       *
       * @param {object} impliedOptionValues
       * @return {Option}
       */
      implies(impliedOptionValues) {
        let newImplied = impliedOptionValues;
        if (typeof impliedOptionValues === "string") {
          newImplied = { [impliedOptionValues]: true };
        }
        this.implied = Object.assign(this.implied || {}, newImplied);
        return this;
      }
      /**
       * Set environment variable to check for option value.
       *
       * An environment variable is only used if when processed the current option value is
       * undefined, or the source of the current value is 'default' or 'config' or 'env'.
       *
       * @param {string} name
       * @return {Option}
       */
      env(name2) {
        this.envVar = name2;
        return this;
      }
      /**
       * Set the custom handler for processing CLI option arguments into option values.
       *
       * @param {Function} [fn]
       * @return {Option}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Whether the option is mandatory and must have a value after parsing.
       *
       * @param {boolean} [mandatory=true]
       * @return {Option}
       */
      makeOptionMandatory(mandatory = true) {
        this.mandatory = !!mandatory;
        return this;
      }
      /**
       * Hide option in help.
       *
       * @param {boolean} [hide=true]
       * @return {Option}
       */
      hideHelp(hide = true) {
        this.hidden = !!hide;
        return this;
      }
      /**
       * @package
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Only allow option value to be one of choices.
       *
       * @param {string[]} values
       * @return {Option}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Return option name.
       *
       * @return {string}
       */
      name() {
        if (this.long) {
          return this.long.replace(/^--/, "");
        }
        return this.short.replace(/^-/, "");
      }
      /**
       * Return option name, in a camelcase format that can be used
       * as a object attribute key.
       *
       * @return {string}
       */
      attributeName() {
        return camelcase(this.name().replace(/^no-/, ""));
      }
      /**
       * Check if `arg` matches the short or long flag.
       *
       * @param {string} arg
       * @return {boolean}
       * @package
       */
      is(arg) {
        return this.short === arg || this.long === arg;
      }
      /**
       * Return whether a boolean option.
       *
       * Options are one of boolean, negated, required argument, or optional argument.
       *
       * @return {boolean}
       * @package
       */
      isBoolean() {
        return !this.required && !this.optional && !this.negate;
      }
    };
    var DualOptions = class {
      /**
       * @param {Option[]} options
       */
      constructor(options) {
        this.positiveOptions = /* @__PURE__ */ new Map();
        this.negativeOptions = /* @__PURE__ */ new Map();
        this.dualOptions = /* @__PURE__ */ new Set();
        options.forEach((option) => {
          if (option.negate) {
            this.negativeOptions.set(option.attributeName(), option);
          } else {
            this.positiveOptions.set(option.attributeName(), option);
          }
        });
        this.negativeOptions.forEach((value, key) => {
          if (this.positiveOptions.has(key)) {
            this.dualOptions.add(key);
          }
        });
      }
      /**
       * Did the value come from the option, and not from possible matching dual option?
       *
       * @param {*} value
       * @param {Option} option
       * @returns {boolean}
       */
      valueFromOption(value, option) {
        const optionKey = option.attributeName();
        if (!this.dualOptions.has(optionKey)) return true;
        const preset = this.negativeOptions.get(optionKey).presetArg;
        const negativeValue = preset !== void 0 ? preset : false;
        return option.negate === (negativeValue === value);
      }
    };
    function camelcase(str2) {
      return str2.split("-").reduce((str3, word) => {
        return str3 + word[0].toUpperCase() + word.slice(1);
      });
    }
    function splitOptionFlags(flags) {
      let shortFlag;
      let longFlag;
      const flagParts = flags.split(/[ |,]+/);
      if (flagParts.length > 1 && !/^[[<]/.test(flagParts[1]))
        shortFlag = flagParts.shift();
      longFlag = flagParts.shift();
      if (!shortFlag && /^-[^-]$/.test(longFlag)) {
        shortFlag = longFlag;
        longFlag = void 0;
      }
      return { shortFlag, longFlag };
    }
    exports.Option = Option2;
    exports.DualOptions = DualOptions;
  }
});

// node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = __commonJS({
  "node_modules/commander/lib/suggestSimilar.js"(exports) {
    var maxDistance = 3;
    function editDistance(a, b) {
      if (Math.abs(a.length - b.length) > maxDistance)
        return Math.max(a.length, b.length);
      const d = [];
      for (let i = 0; i <= a.length; i++) {
        d[i] = [i];
      }
      for (let j = 0; j <= b.length; j++) {
        d[0][j] = j;
      }
      for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
          let cost = 1;
          if (a[i - 1] === b[j - 1]) {
            cost = 0;
          } else {
            cost = 1;
          }
          d[i][j] = Math.min(
            d[i - 1][j] + 1,
            // deletion
            d[i][j - 1] + 1,
            // insertion
            d[i - 1][j - 1] + cost
            // substitution
          );
          if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
            d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
          }
        }
      }
      return d[a.length][b.length];
    }
    function suggestSimilar(word, candidates) {
      if (!candidates || candidates.length === 0) return "";
      candidates = Array.from(new Set(candidates));
      const searchingOptions = word.startsWith("--");
      if (searchingOptions) {
        word = word.slice(2);
        candidates = candidates.map((candidate) => candidate.slice(2));
      }
      let similar = [];
      let bestDistance = maxDistance;
      const minSimilarity = 0.4;
      candidates.forEach((candidate) => {
        if (candidate.length <= 1) return;
        const distance = editDistance(word, candidate);
        const length = Math.max(word.length, candidate.length);
        const similarity = (length - distance) / length;
        if (similarity > minSimilarity) {
          if (distance < bestDistance) {
            bestDistance = distance;
            similar = [candidate];
          } else if (distance === bestDistance) {
            similar.push(candidate);
          }
        }
      });
      similar.sort((a, b) => a.localeCompare(b));
      if (searchingOptions) {
        similar = similar.map((candidate) => `--${candidate}`);
      }
      if (similar.length > 1) {
        return `
(Did you mean one of ${similar.join(", ")}?)`;
      }
      if (similar.length === 1) {
        return `
(Did you mean ${similar[0]}?)`;
      }
      return "";
    }
    exports.suggestSimilar = suggestSimilar;
  }
});

// node_modules/commander/lib/command.js
var require_command = __commonJS({
  "node_modules/commander/lib/command.js"(exports) {
    var EventEmitter = __require("node:events").EventEmitter;
    var childProcess = __require("node:child_process");
    var path6 = __require("node:path");
    var fs = __require("node:fs");
    var process2 = __require("node:process");
    var { Argument: Argument2, humanReadableArgName } = require_argument();
    var { CommanderError: CommanderError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2, DualOptions } = require_option();
    var { suggestSimilar } = require_suggestSimilar();
    var Command2 = class _Command extends EventEmitter {
      /**
       * Initialize a new `Command`.
       *
       * @param {string} [name]
       */
      constructor(name2) {
        super();
        this.commands = [];
        this.options = [];
        this.parent = null;
        this._allowUnknownOption = false;
        this._allowExcessArguments = true;
        this.registeredArguments = [];
        this._args = this.registeredArguments;
        this.args = [];
        this.rawArgs = [];
        this.processedArgs = [];
        this._scriptPath = null;
        this._name = name2 || "";
        this._optionValues = {};
        this._optionValueSources = {};
        this._storeOptionsAsProperties = false;
        this._actionHandler = null;
        this._executableHandler = false;
        this._executableFile = null;
        this._executableDir = null;
        this._defaultCommandName = null;
        this._exitCallback = null;
        this._aliases = [];
        this._combineFlagAndOptionalValue = true;
        this._description = "";
        this._summary = "";
        this._argsDescription = void 0;
        this._enablePositionalOptions = false;
        this._passThroughOptions = false;
        this._lifeCycleHooks = {};
        this._showHelpAfterError = false;
        this._showSuggestionAfterError = true;
        this._outputConfiguration = {
          writeOut: (str2) => process2.stdout.write(str2),
          writeErr: (str2) => process2.stderr.write(str2),
          getOutHelpWidth: () => process2.stdout.isTTY ? process2.stdout.columns : void 0,
          getErrHelpWidth: () => process2.stderr.isTTY ? process2.stderr.columns : void 0,
          outputError: (str2, write) => write(str2)
        };
        this._hidden = false;
        this._helpOption = void 0;
        this._addImplicitHelpCommand = void 0;
        this._helpCommand = void 0;
        this._helpConfiguration = {};
      }
      /**
       * Copy settings that are useful to have in common across root command and subcommands.
       *
       * (Used internally when adding a command using `.command()` so subcommands inherit parent settings.)
       *
       * @param {Command} sourceCommand
       * @return {Command} `this` command for chaining
       */
      copyInheritedSettings(sourceCommand) {
        this._outputConfiguration = sourceCommand._outputConfiguration;
        this._helpOption = sourceCommand._helpOption;
        this._helpCommand = sourceCommand._helpCommand;
        this._helpConfiguration = sourceCommand._helpConfiguration;
        this._exitCallback = sourceCommand._exitCallback;
        this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
        this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
        this._allowExcessArguments = sourceCommand._allowExcessArguments;
        this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
        this._showHelpAfterError = sourceCommand._showHelpAfterError;
        this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
        return this;
      }
      /**
       * @returns {Command[]}
       * @private
       */
      _getCommandAndAncestors() {
        const result = [];
        for (let command = this; command; command = command.parent) {
          result.push(command);
        }
        return result;
      }
      /**
       * Define a command.
       *
       * There are two styles of command: pay attention to where to put the description.
       *
       * @example
       * // Command implemented using action handler (description is supplied separately to `.command`)
       * program
       *   .command('clone <source> [destination]')
       *   .description('clone a repository into a newly created directory')
       *   .action((source, destination) => {
       *     console.log('clone command called');
       *   });
       *
       * // Command implemented using separate executable file (description is second parameter to `.command`)
       * program
       *   .command('start <service>', 'start named service')
       *   .command('stop [service]', 'stop named service, or all if no name supplied');
       *
       * @param {string} nameAndArgs - command name and arguments, args are `<required>` or `[optional]` and last may also be `variadic...`
       * @param {(object | string)} [actionOptsOrExecDesc] - configuration options (for action), or description (for executable)
       * @param {object} [execOpts] - configuration options (for executable)
       * @return {Command} returns new command for action handler, or `this` for executable command
       */
      command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
        let desc = actionOptsOrExecDesc;
        let opts = execOpts;
        if (typeof desc === "object" && desc !== null) {
          opts = desc;
          desc = null;
        }
        opts = opts || {};
        const [, name2, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
        const cmd = this.createCommand(name2);
        if (desc) {
          cmd.description(desc);
          cmd._executableHandler = true;
        }
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        cmd._hidden = !!(opts.noHelp || opts.hidden);
        cmd._executableFile = opts.executableFile || null;
        if (args) cmd.arguments(args);
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd.copyInheritedSettings(this);
        if (desc) return this;
        return cmd;
      }
      /**
       * Factory routine to create a new unattached command.
       *
       * See .command() for creating an attached subcommand, which uses this routine to
       * create the command. You can override createCommand to customise subcommands.
       *
       * @param {string} [name]
       * @return {Command} new command
       */
      createCommand(name2) {
        return new _Command(name2);
      }
      /**
       * You can customise the help with a subclass of Help by overriding createHelp,
       * or by overriding Help properties using configureHelp().
       *
       * @return {Help}
       */
      createHelp() {
        return Object.assign(new Help2(), this.configureHelp());
      }
      /**
       * You can customise the help by overriding Help properties using configureHelp(),
       * or with a subclass of Help by overriding createHelp().
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureHelp(configuration) {
        if (configuration === void 0) return this._helpConfiguration;
        this._helpConfiguration = configuration;
        return this;
      }
      /**
       * The default output goes to stdout and stderr. You can customise this for special
       * applications. You can also customise the display of errors by overriding outputError.
       *
       * The configuration properties are all functions:
       *
       *     // functions to change where being written, stdout and stderr
       *     writeOut(str)
       *     writeErr(str)
       *     // matching functions to specify width for wrapping help
       *     getOutHelpWidth()
       *     getErrHelpWidth()
       *     // functions based on what is being written out
       *     outputError(str, write) // used for displaying errors, and not used for displaying help
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureOutput(configuration) {
        if (configuration === void 0) return this._outputConfiguration;
        Object.assign(this._outputConfiguration, configuration);
        return this;
      }
      /**
       * Display the help or a custom message after an error occurs.
       *
       * @param {(boolean|string)} [displayHelp]
       * @return {Command} `this` command for chaining
       */
      showHelpAfterError(displayHelp = true) {
        if (typeof displayHelp !== "string") displayHelp = !!displayHelp;
        this._showHelpAfterError = displayHelp;
        return this;
      }
      /**
       * Display suggestion of similar commands for unknown commands, or options for unknown options.
       *
       * @param {boolean} [displaySuggestion]
       * @return {Command} `this` command for chaining
       */
      showSuggestionAfterError(displaySuggestion = true) {
        this._showSuggestionAfterError = !!displaySuggestion;
        return this;
      }
      /**
       * Add a prepared subcommand.
       *
       * See .command() for creating an attached subcommand which inherits settings from its parent.
       *
       * @param {Command} cmd - new subcommand
       * @param {object} [opts] - configuration options
       * @return {Command} `this` command for chaining
       */
      addCommand(cmd, opts) {
        if (!cmd._name) {
          throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
        }
        opts = opts || {};
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        if (opts.noHelp || opts.hidden) cmd._hidden = true;
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd._checkForBrokenPassThrough();
        return this;
      }
      /**
       * Factory routine to create a new unattached argument.
       *
       * See .argument() for creating an attached argument, which uses this routine to
       * create the argument. You can override createArgument to return a custom argument.
       *
       * @param {string} name
       * @param {string} [description]
       * @return {Argument} new argument
       */
      createArgument(name2, description) {
        return new Argument2(name2, description);
      }
      /**
       * Define argument syntax for command.
       *
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @example
       * program.argument('<input-file>');
       * program.argument('[output-file]');
       *
       * @param {string} name
       * @param {string} [description]
       * @param {(Function|*)} [fn] - custom argument processing function
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      argument(name2, description, fn, defaultValue) {
        const argument = this.createArgument(name2, description);
        if (typeof fn === "function") {
          argument.default(defaultValue).argParser(fn);
        } else {
          argument.default(fn);
        }
        this.addArgument(argument);
        return this;
      }
      /**
       * Define argument syntax for command, adding multiple at once (without descriptions).
       *
       * See also .argument().
       *
       * @example
       * program.arguments('<cmd> [env]');
       *
       * @param {string} names
       * @return {Command} `this` command for chaining
       */
      arguments(names) {
        names.trim().split(/ +/).forEach((detail) => {
          this.argument(detail);
        });
        return this;
      }
      /**
       * Define argument syntax for command, adding a prepared argument.
       *
       * @param {Argument} argument
       * @return {Command} `this` command for chaining
       */
      addArgument(argument) {
        const previousArgument = this.registeredArguments.slice(-1)[0];
        if (previousArgument && previousArgument.variadic) {
          throw new Error(
            `only the last argument can be variadic '${previousArgument.name()}'`
          );
        }
        if (argument.required && argument.defaultValue !== void 0 && argument.parseArg === void 0) {
          throw new Error(
            `a default value for a required argument is never used: '${argument.name()}'`
          );
        }
        this.registeredArguments.push(argument);
        return this;
      }
      /**
       * Customise or override default help command. By default a help command is automatically added if your command has subcommands.
       *
       * @example
       *    program.helpCommand('help [cmd]');
       *    program.helpCommand('help [cmd]', 'show help');
       *    program.helpCommand(false); // suppress default help command
       *    program.helpCommand(true); // add help command even if no subcommands
       *
       * @param {string|boolean} enableOrNameAndArgs - enable with custom name and/or arguments, or boolean to override whether added
       * @param {string} [description] - custom description
       * @return {Command} `this` command for chaining
       */
      helpCommand(enableOrNameAndArgs, description) {
        if (typeof enableOrNameAndArgs === "boolean") {
          this._addImplicitHelpCommand = enableOrNameAndArgs;
          return this;
        }
        enableOrNameAndArgs = enableOrNameAndArgs ?? "help [command]";
        const [, helpName, helpArgs] = enableOrNameAndArgs.match(/([^ ]+) *(.*)/);
        const helpDescription = description ?? "display help for command";
        const helpCommand = this.createCommand(helpName);
        helpCommand.helpOption(false);
        if (helpArgs) helpCommand.arguments(helpArgs);
        if (helpDescription) helpCommand.description(helpDescription);
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        return this;
      }
      /**
       * Add prepared custom help command.
       *
       * @param {(Command|string|boolean)} helpCommand - custom help command, or deprecated enableOrNameAndArgs as for `.helpCommand()`
       * @param {string} [deprecatedDescription] - deprecated custom description used with custom name only
       * @return {Command} `this` command for chaining
       */
      addHelpCommand(helpCommand, deprecatedDescription) {
        if (typeof helpCommand !== "object") {
          this.helpCommand(helpCommand, deprecatedDescription);
          return this;
        }
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        return this;
      }
      /**
       * Lazy create help command.
       *
       * @return {(Command|null)}
       * @package
       */
      _getHelpCommand() {
        const hasImplicitHelpCommand = this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"));
        if (hasImplicitHelpCommand) {
          if (this._helpCommand === void 0) {
            this.helpCommand(void 0, void 0);
          }
          return this._helpCommand;
        }
        return null;
      }
      /**
       * Add hook for life cycle event.
       *
       * @param {string} event
       * @param {Function} listener
       * @return {Command} `this` command for chaining
       */
      hook(event, listener) {
        const allowedValues = ["preSubcommand", "preAction", "postAction"];
        if (!allowedValues.includes(event)) {
          throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        if (this._lifeCycleHooks[event]) {
          this._lifeCycleHooks[event].push(listener);
        } else {
          this._lifeCycleHooks[event] = [listener];
        }
        return this;
      }
      /**
       * Register callback to use as replacement for calling process.exit.
       *
       * @param {Function} [fn] optional callback which will be passed a CommanderError, defaults to throwing
       * @return {Command} `this` command for chaining
       */
      exitOverride(fn) {
        if (fn) {
          this._exitCallback = fn;
        } else {
          this._exitCallback = (err) => {
            if (err.code !== "commander.executeSubCommandAsync") {
              throw err;
            } else {
            }
          };
        }
        return this;
      }
      /**
       * Call process.exit, and _exitCallback if defined.
       *
       * @param {number} exitCode exit code for using with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       * @return never
       * @private
       */
      _exit(exitCode, code, message) {
        if (this._exitCallback) {
          this._exitCallback(new CommanderError2(exitCode, code, message));
        }
        process2.exit(exitCode);
      }
      /**
       * Register callback `fn` for the command.
       *
       * @example
       * program
       *   .command('serve')
       *   .description('start service')
       *   .action(function() {
       *      // do work here
       *   });
       *
       * @param {Function} fn
       * @return {Command} `this` command for chaining
       */
      action(fn) {
        const listener = (args) => {
          const expectedArgsCount = this.registeredArguments.length;
          const actionArgs = args.slice(0, expectedArgsCount);
          if (this._storeOptionsAsProperties) {
            actionArgs[expectedArgsCount] = this;
          } else {
            actionArgs[expectedArgsCount] = this.opts();
          }
          actionArgs.push(this);
          return fn.apply(this, actionArgs);
        };
        this._actionHandler = listener;
        return this;
      }
      /**
       * Factory routine to create a new unattached option.
       *
       * See .option() for creating an attached option, which uses this routine to
       * create the option. You can override createOption to return a custom option.
       *
       * @param {string} flags
       * @param {string} [description]
       * @return {Option} new option
       */
      createOption(flags, description) {
        return new Option2(flags, description);
      }
      /**
       * Wrap parseArgs to catch 'commander.invalidArgument'.
       *
       * @param {(Option | Argument)} target
       * @param {string} value
       * @param {*} previous
       * @param {string} invalidArgumentMessage
       * @private
       */
      _callParseArg(target, value, previous, invalidArgumentMessage) {
        try {
          return target.parseArg(value, previous);
        } catch (err) {
          if (err.code === "commander.invalidArgument") {
            const message = `${invalidArgumentMessage} ${err.message}`;
            this.error(message, { exitCode: err.exitCode, code: err.code });
          }
          throw err;
        }
      }
      /**
       * Check for option flag conflicts.
       * Register option if no conflicts found, or throw on conflict.
       *
       * @param {Option} option
       * @private
       */
      _registerOption(option) {
        const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
        if (matchingOption) {
          const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
          throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
        }
        this.options.push(option);
      }
      /**
       * Check for command name and alias conflicts with existing commands.
       * Register command if no conflicts found, or throw on conflict.
       *
       * @param {Command} command
       * @private
       */
      _registerCommand(command) {
        const knownBy = (cmd) => {
          return [cmd.name()].concat(cmd.aliases());
        };
        const alreadyUsed = knownBy(command).find(
          (name2) => this._findCommand(name2)
        );
        if (alreadyUsed) {
          const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
          const newCmd = knownBy(command).join("|");
          throw new Error(
            `cannot add command '${newCmd}' as already have command '${existingCmd}'`
          );
        }
        this.commands.push(command);
      }
      /**
       * Add an option.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addOption(option) {
        this._registerOption(option);
        const oname = option.name();
        const name2 = option.attributeName();
        if (option.negate) {
          const positiveLongFlag = option.long.replace(/^--no-/, "--");
          if (!this._findOption(positiveLongFlag)) {
            this.setOptionValueWithSource(
              name2,
              option.defaultValue === void 0 ? true : option.defaultValue,
              "default"
            );
          }
        } else if (option.defaultValue !== void 0) {
          this.setOptionValueWithSource(name2, option.defaultValue, "default");
        }
        const handleOptionValue = (val, invalidValueMessage, valueSource) => {
          if (val == null && option.presetArg !== void 0) {
            val = option.presetArg;
          }
          const oldValue = this.getOptionValue(name2);
          if (val !== null && option.parseArg) {
            val = this._callParseArg(option, val, oldValue, invalidValueMessage);
          } else if (val !== null && option.variadic) {
            val = option._concatValue(val, oldValue);
          }
          if (val == null) {
            if (option.negate) {
              val = false;
            } else if (option.isBoolean() || option.optional) {
              val = true;
            } else {
              val = "";
            }
          }
          this.setOptionValueWithSource(name2, val, valueSource);
        };
        this.on("option:" + oname, (val) => {
          const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
          handleOptionValue(val, invalidValueMessage, "cli");
        });
        if (option.envVar) {
          this.on("optionEnv:" + oname, (val) => {
            const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
            handleOptionValue(val, invalidValueMessage, "env");
          });
        }
        return this;
      }
      /**
       * Internal implementation shared by .option() and .requiredOption()
       *
       * @return {Command} `this` command for chaining
       * @private
       */
      _optionEx(config, flags, description, fn, defaultValue) {
        if (typeof flags === "object" && flags instanceof Option2) {
          throw new Error(
            "To add an Option object use addOption() instead of option() or requiredOption()"
          );
        }
        const option = this.createOption(flags, description);
        option.makeOptionMandatory(!!config.mandatory);
        if (typeof fn === "function") {
          option.default(defaultValue).argParser(fn);
        } else if (fn instanceof RegExp) {
          const regex = fn;
          fn = (val, def) => {
            const m = regex.exec(val);
            return m ? m[0] : def;
          };
          option.default(defaultValue).argParser(fn);
        } else {
          option.default(fn);
        }
        return this.addOption(option);
      }
      /**
       * Define option with `flags`, `description`, and optional argument parsing function or `defaultValue` or both.
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space. A required
       * option-argument is indicated by `<>` and an optional option-argument by `[]`.
       *
       * See the README for more details, and see also addOption() and requiredOption().
       *
       * @example
       * program
       *     .option('-p, --pepper', 'add pepper')
       *     .option('-p, --pizza-type <TYPE>', 'type of pizza') // required option-argument
       *     .option('-c, --cheese [CHEESE]', 'add extra cheese', 'mozzarella') // optional option-argument with default
       *     .option('-t, --tip <VALUE>', 'add tip to purchase cost', parseFloat) // custom parse function
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      option(flags, description, parseArg, defaultValue) {
        return this._optionEx({}, flags, description, parseArg, defaultValue);
      }
      /**
       * Add a required option which must have a value after parsing. This usually means
       * the option must be specified on the command line. (Otherwise the same as .option().)
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      requiredOption(flags, description, parseArg, defaultValue) {
        return this._optionEx(
          { mandatory: true },
          flags,
          description,
          parseArg,
          defaultValue
        );
      }
      /**
       * Alter parsing of short flags with optional values.
       *
       * @example
       * // for `.option('-f,--flag [value]'):
       * program.combineFlagAndOptionalValue(true);  // `-f80` is treated like `--flag=80`, this is the default behaviour
       * program.combineFlagAndOptionalValue(false) // `-fb` is treated like `-f -b`
       *
       * @param {boolean} [combine] - if `true` or omitted, an optional value can be specified directly after the flag.
       * @return {Command} `this` command for chaining
       */
      combineFlagAndOptionalValue(combine = true) {
        this._combineFlagAndOptionalValue = !!combine;
        return this;
      }
      /**
       * Allow unknown options on the command line.
       *
       * @param {boolean} [allowUnknown] - if `true` or omitted, no error will be thrown for unknown options.
       * @return {Command} `this` command for chaining
       */
      allowUnknownOption(allowUnknown = true) {
        this._allowUnknownOption = !!allowUnknown;
        return this;
      }
      /**
       * Allow excess command-arguments on the command line. Pass false to make excess arguments an error.
       *
       * @param {boolean} [allowExcess] - if `true` or omitted, no error will be thrown for excess arguments.
       * @return {Command} `this` command for chaining
       */
      allowExcessArguments(allowExcess = true) {
        this._allowExcessArguments = !!allowExcess;
        return this;
      }
      /**
       * Enable positional options. Positional means global options are specified before subcommands which lets
       * subcommands reuse the same option names, and also enables subcommands to turn on passThroughOptions.
       * The default behaviour is non-positional and global options may appear anywhere on the command line.
       *
       * @param {boolean} [positional]
       * @return {Command} `this` command for chaining
       */
      enablePositionalOptions(positional = true) {
        this._enablePositionalOptions = !!positional;
        return this;
      }
      /**
       * Pass through options that come after command-arguments rather than treat them as command-options,
       * so actual command-options come before command-arguments. Turning this on for a subcommand requires
       * positional options to have been enabled on the program (parent commands).
       * The default behaviour is non-positional and options may appear before or after command-arguments.
       *
       * @param {boolean} [passThrough] for unknown options.
       * @return {Command} `this` command for chaining
       */
      passThroughOptions(passThrough = true) {
        this._passThroughOptions = !!passThrough;
        this._checkForBrokenPassThrough();
        return this;
      }
      /**
       * @private
       */
      _checkForBrokenPassThrough() {
        if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
          throw new Error(
            `passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`
          );
        }
      }
      /**
       * Whether to store option values as properties on command object,
       * or store separately (specify false). In both cases the option values can be accessed using .opts().
       *
       * @param {boolean} [storeAsProperties=true]
       * @return {Command} `this` command for chaining
       */
      storeOptionsAsProperties(storeAsProperties = true) {
        if (this.options.length) {
          throw new Error("call .storeOptionsAsProperties() before adding options");
        }
        if (Object.keys(this._optionValues).length) {
          throw new Error(
            "call .storeOptionsAsProperties() before setting option values"
          );
        }
        this._storeOptionsAsProperties = !!storeAsProperties;
        return this;
      }
      /**
       * Retrieve option value.
       *
       * @param {string} key
       * @return {object} value
       */
      getOptionValue(key) {
        if (this._storeOptionsAsProperties) {
          return this[key];
        }
        return this._optionValues[key];
      }
      /**
       * Store option value.
       *
       * @param {string} key
       * @param {object} value
       * @return {Command} `this` command for chaining
       */
      setOptionValue(key, value) {
        return this.setOptionValueWithSource(key, value, void 0);
      }
      /**
       * Store option value and where the value came from.
       *
       * @param {string} key
       * @param {object} value
       * @param {string} source - expected values are default/config/env/cli/implied
       * @return {Command} `this` command for chaining
       */
      setOptionValueWithSource(key, value, source) {
        if (this._storeOptionsAsProperties) {
          this[key] = value;
        } else {
          this._optionValues[key] = value;
        }
        this._optionValueSources[key] = source;
        return this;
      }
      /**
       * Get source of option value.
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSource(key) {
        return this._optionValueSources[key];
      }
      /**
       * Get source of option value. See also .optsWithGlobals().
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSourceWithGlobals(key) {
        let source;
        this._getCommandAndAncestors().forEach((cmd) => {
          if (cmd.getOptionValueSource(key) !== void 0) {
            source = cmd.getOptionValueSource(key);
          }
        });
        return source;
      }
      /**
       * Get user arguments from implied or explicit arguments.
       * Side-effects: set _scriptPath if args included script. Used for default program name, and subcommand searches.
       *
       * @private
       */
      _prepareUserArgs(argv, parseOptions) {
        if (argv !== void 0 && !Array.isArray(argv)) {
          throw new Error("first parameter to parse must be array or undefined");
        }
        parseOptions = parseOptions || {};
        if (argv === void 0 && parseOptions.from === void 0) {
          if (process2.versions?.electron) {
            parseOptions.from = "electron";
          }
          const execArgv = process2.execArgv ?? [];
          if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) {
            parseOptions.from = "eval";
          }
        }
        if (argv === void 0) {
          argv = process2.argv;
        }
        this.rawArgs = argv.slice();
        let userArgs;
        switch (parseOptions.from) {
          case void 0:
          case "node":
            this._scriptPath = argv[1];
            userArgs = argv.slice(2);
            break;
          case "electron":
            if (process2.defaultApp) {
              this._scriptPath = argv[1];
              userArgs = argv.slice(2);
            } else {
              userArgs = argv.slice(1);
            }
            break;
          case "user":
            userArgs = argv.slice(0);
            break;
          case "eval":
            userArgs = argv.slice(1);
            break;
          default:
            throw new Error(
              `unexpected parse option { from: '${parseOptions.from}' }`
            );
        }
        if (!this._name && this._scriptPath)
          this.nameFromFilename(this._scriptPath);
        this._name = this._name || "program";
        return userArgs;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Use parseAsync instead of parse if any of your action handlers are async.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * program.parse(); // parse process.argv and auto-detect electron and special node flags
       * program.parse(process.argv); // assume argv[0] is app and argv[1] is script
       * program.parse(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv] - optional, defaults to process.argv
       * @param {object} [parseOptions] - optionally specify style of options with from: node/user/electron
       * @param {string} [parseOptions.from] - where the args are from: 'node', 'user', 'electron'
       * @return {Command} `this` command for chaining
       */
      parse(argv, parseOptions) {
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * await program.parseAsync(); // parse process.argv and auto-detect electron and special node flags
       * await program.parseAsync(process.argv); // assume argv[0] is app and argv[1] is script
       * await program.parseAsync(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv]
       * @param {object} [parseOptions]
       * @param {string} parseOptions.from - where the args are from: 'node', 'user', 'electron'
       * @return {Promise}
       */
      async parseAsync(argv, parseOptions) {
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        await this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Execute a sub-command executable.
       *
       * @private
       */
      _executeSubCommand(subcommand, args) {
        args = args.slice();
        let launchWithNode = false;
        const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
        function findFile(baseDir, baseName) {
          const localBin = path6.resolve(baseDir, baseName);
          if (fs.existsSync(localBin)) return localBin;
          if (sourceExt.includes(path6.extname(baseName))) return void 0;
          const foundExt = sourceExt.find(
            (ext) => fs.existsSync(`${localBin}${ext}`)
          );
          if (foundExt) return `${localBin}${foundExt}`;
          return void 0;
        }
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
        let executableDir = this._executableDir || "";
        if (this._scriptPath) {
          let resolvedScriptPath;
          try {
            resolvedScriptPath = fs.realpathSync(this._scriptPath);
          } catch (err) {
            resolvedScriptPath = this._scriptPath;
          }
          executableDir = path6.resolve(
            path6.dirname(resolvedScriptPath),
            executableDir
          );
        }
        if (executableDir) {
          let localFile = findFile(executableDir, executableFile);
          if (!localFile && !subcommand._executableFile && this._scriptPath) {
            const legacyName = path6.basename(
              this._scriptPath,
              path6.extname(this._scriptPath)
            );
            if (legacyName !== this._name) {
              localFile = findFile(
                executableDir,
                `${legacyName}-${subcommand._name}`
              );
            }
          }
          executableFile = localFile || executableFile;
        }
        launchWithNode = sourceExt.includes(path6.extname(executableFile));
        let proc;
        if (process2.platform !== "win32") {
          if (launchWithNode) {
            args.unshift(executableFile);
            args = incrementNodeInspectorPort(process2.execArgv).concat(args);
            proc = childProcess.spawn(process2.argv[0], args, { stdio: "inherit" });
          } else {
            proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
          }
        } else {
          args.unshift(executableFile);
          args = incrementNodeInspectorPort(process2.execArgv).concat(args);
          proc = childProcess.spawn(process2.execPath, args, { stdio: "inherit" });
        }
        if (!proc.killed) {
          const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
          signals.forEach((signal) => {
            process2.on(signal, () => {
              if (proc.killed === false && proc.exitCode === null) {
                proc.kill(signal);
              }
            });
          });
        }
        const exitCallback = this._exitCallback;
        proc.on("close", (code) => {
          code = code ?? 1;
          if (!exitCallback) {
            process2.exit(code);
          } else {
            exitCallback(
              new CommanderError2(
                code,
                "commander.executeSubCommandAsync",
                "(close)"
              )
            );
          }
        });
        proc.on("error", (err) => {
          if (err.code === "ENOENT") {
            const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
            const executableMissing = `'${executableFile}' does not exist
 - if '${subcommand._name}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
            throw new Error(executableMissing);
          } else if (err.code === "EACCES") {
            throw new Error(`'${executableFile}' not executable`);
          }
          if (!exitCallback) {
            process2.exit(1);
          } else {
            const wrappedError = new CommanderError2(
              1,
              "commander.executeSubCommandAsync",
              "(error)"
            );
            wrappedError.nestedError = err;
            exitCallback(wrappedError);
          }
        });
        this.runningCommand = proc;
      }
      /**
       * @private
       */
      _dispatchSubcommand(commandName, operands, unknown) {
        const subCommand = this._findCommand(commandName);
        if (!subCommand) this.help({ error: true });
        let promiseChain;
        promiseChain = this._chainOrCallSubCommandHook(
          promiseChain,
          subCommand,
          "preSubcommand"
        );
        promiseChain = this._chainOrCall(promiseChain, () => {
          if (subCommand._executableHandler) {
            this._executeSubCommand(subCommand, operands.concat(unknown));
          } else {
            return subCommand._parseCommand(operands, unknown);
          }
        });
        return promiseChain;
      }
      /**
       * Invoke help directly if possible, or dispatch if necessary.
       * e.g. help foo
       *
       * @private
       */
      _dispatchHelpCommand(subcommandName) {
        if (!subcommandName) {
          this.help();
        }
        const subCommand = this._findCommand(subcommandName);
        if (subCommand && !subCommand._executableHandler) {
          subCommand.help();
        }
        return this._dispatchSubcommand(
          subcommandName,
          [],
          [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]
        );
      }
      /**
       * Check this.args against expected this.registeredArguments.
       *
       * @private
       */
      _checkNumberOfArguments() {
        this.registeredArguments.forEach((arg, i) => {
          if (arg.required && this.args[i] == null) {
            this.missingArgument(arg.name());
          }
        });
        if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
          return;
        }
        if (this.args.length > this.registeredArguments.length) {
          this._excessArguments(this.args);
        }
      }
      /**
       * Process this.args using this.registeredArguments and save as this.processedArgs!
       *
       * @private
       */
      _processArguments() {
        const myParseArg = (argument, value, previous) => {
          let parsedValue = value;
          if (value !== null && argument.parseArg) {
            const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
            parsedValue = this._callParseArg(
              argument,
              value,
              previous,
              invalidValueMessage
            );
          }
          return parsedValue;
        };
        this._checkNumberOfArguments();
        const processedArgs = [];
        this.registeredArguments.forEach((declaredArg, index) => {
          let value = declaredArg.defaultValue;
          if (declaredArg.variadic) {
            if (index < this.args.length) {
              value = this.args.slice(index);
              if (declaredArg.parseArg) {
                value = value.reduce((processed, v) => {
                  return myParseArg(declaredArg, v, processed);
                }, declaredArg.defaultValue);
              }
            } else if (value === void 0) {
              value = [];
            }
          } else if (index < this.args.length) {
            value = this.args[index];
            if (declaredArg.parseArg) {
              value = myParseArg(declaredArg, value, declaredArg.defaultValue);
            }
          }
          processedArgs[index] = value;
        });
        this.processedArgs = processedArgs;
      }
      /**
       * Once we have a promise we chain, but call synchronously until then.
       *
       * @param {(Promise|undefined)} promise
       * @param {Function} fn
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCall(promise, fn) {
        if (promise && promise.then && typeof promise.then === "function") {
          return promise.then(() => fn());
        }
        return fn();
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallHooks(promise, event) {
        let result = promise;
        const hooks = [];
        this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== void 0).forEach((hookedCommand) => {
          hookedCommand._lifeCycleHooks[event].forEach((callback) => {
            hooks.push({ hookedCommand, callback });
          });
        });
        if (event === "postAction") {
          hooks.reverse();
        }
        hooks.forEach((hookDetail) => {
          result = this._chainOrCall(result, () => {
            return hookDetail.callback(hookDetail.hookedCommand, this);
          });
        });
        return result;
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {Command} subCommand
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallSubCommandHook(promise, subCommand, event) {
        let result = promise;
        if (this._lifeCycleHooks[event] !== void 0) {
          this._lifeCycleHooks[event].forEach((hook) => {
            result = this._chainOrCall(result, () => {
              return hook(this, subCommand);
            });
          });
        }
        return result;
      }
      /**
       * Process arguments in context of this command.
       * Returns action result, in case it is a promise.
       *
       * @private
       */
      _parseCommand(operands, unknown) {
        const parsed = this.parseOptions(unknown);
        this._parseOptionsEnv();
        this._parseOptionsImplied();
        operands = operands.concat(parsed.operands);
        unknown = parsed.unknown;
        this.args = operands.concat(unknown);
        if (operands && this._findCommand(operands[0])) {
          return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
        }
        if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
          return this._dispatchHelpCommand(operands[1]);
        }
        if (this._defaultCommandName) {
          this._outputHelpIfRequested(unknown);
          return this._dispatchSubcommand(
            this._defaultCommandName,
            operands,
            unknown
          );
        }
        if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
          this.help({ error: true });
        }
        this._outputHelpIfRequested(parsed.unknown);
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        const checkForUnknownOptions = () => {
          if (parsed.unknown.length > 0) {
            this.unknownOption(parsed.unknown[0]);
          }
        };
        const commandEvent = `command:${this.name()}`;
        if (this._actionHandler) {
          checkForUnknownOptions();
          this._processArguments();
          let promiseChain;
          promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
          promiseChain = this._chainOrCall(
            promiseChain,
            () => this._actionHandler(this.processedArgs)
          );
          if (this.parent) {
            promiseChain = this._chainOrCall(promiseChain, () => {
              this.parent.emit(commandEvent, operands, unknown);
            });
          }
          promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
          return promiseChain;
        }
        if (this.parent && this.parent.listenerCount(commandEvent)) {
          checkForUnknownOptions();
          this._processArguments();
          this.parent.emit(commandEvent, operands, unknown);
        } else if (operands.length) {
          if (this._findCommand("*")) {
            return this._dispatchSubcommand("*", operands, unknown);
          }
          if (this.listenerCount("command:*")) {
            this.emit("command:*", operands, unknown);
          } else if (this.commands.length) {
            this.unknownCommand();
          } else {
            checkForUnknownOptions();
            this._processArguments();
          }
        } else if (this.commands.length) {
          checkForUnknownOptions();
          this.help({ error: true });
        } else {
          checkForUnknownOptions();
          this._processArguments();
        }
      }
      /**
       * Find matching command.
       *
       * @private
       * @return {Command | undefined}
       */
      _findCommand(name2) {
        if (!name2) return void 0;
        return this.commands.find(
          (cmd) => cmd._name === name2 || cmd._aliases.includes(name2)
        );
      }
      /**
       * Return an option matching `arg` if any.
       *
       * @param {string} arg
       * @return {Option}
       * @package
       */
      _findOption(arg) {
        return this.options.find((option) => option.is(arg));
      }
      /**
       * Display an error message if a mandatory option does not have a value.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForMissingMandatoryOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd.options.forEach((anOption) => {
            if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === void 0) {
              cmd.missingMandatoryOptionValue(anOption);
            }
          });
        });
      }
      /**
       * Display an error message if conflicting options are used together in this.
       *
       * @private
       */
      _checkForConflictingLocalOptions() {
        const definedNonDefaultOptions = this.options.filter((option) => {
          const optionKey = option.attributeName();
          if (this.getOptionValue(optionKey) === void 0) {
            return false;
          }
          return this.getOptionValueSource(optionKey) !== "default";
        });
        const optionsWithConflicting = definedNonDefaultOptions.filter(
          (option) => option.conflictsWith.length > 0
        );
        optionsWithConflicting.forEach((option) => {
          const conflictingAndDefined = definedNonDefaultOptions.find(
            (defined) => option.conflictsWith.includes(defined.attributeName())
          );
          if (conflictingAndDefined) {
            this._conflictingOption(option, conflictingAndDefined);
          }
        });
      }
      /**
       * Display an error message if conflicting options are used together.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForConflictingOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd._checkForConflictingLocalOptions();
        });
      }
      /**
       * Parse options from `argv` removing known options,
       * and return argv split into operands and unknown arguments.
       *
       * Examples:
       *
       *     argv => operands, unknown
       *     --known kkk op => [op], []
       *     op --known kkk => [op], []
       *     sub --unknown uuu op => [sub], [--unknown uuu op]
       *     sub -- --unknown uuu op => [sub --unknown uuu op], []
       *
       * @param {string[]} argv
       * @return {{operands: string[], unknown: string[]}}
       */
      parseOptions(argv) {
        const operands = [];
        const unknown = [];
        let dest = operands;
        const args = argv.slice();
        function maybeOption(arg) {
          return arg.length > 1 && arg[0] === "-";
        }
        let activeVariadicOption = null;
        while (args.length) {
          const arg = args.shift();
          if (arg === "--") {
            if (dest === unknown) dest.push(arg);
            dest.push(...args);
            break;
          }
          if (activeVariadicOption && !maybeOption(arg)) {
            this.emit(`option:${activeVariadicOption.name()}`, arg);
            continue;
          }
          activeVariadicOption = null;
          if (maybeOption(arg)) {
            const option = this._findOption(arg);
            if (option) {
              if (option.required) {
                const value = args.shift();
                if (value === void 0) this.optionMissingArgument(option);
                this.emit(`option:${option.name()}`, value);
              } else if (option.optional) {
                let value = null;
                if (args.length > 0 && !maybeOption(args[0])) {
                  value = args.shift();
                }
                this.emit(`option:${option.name()}`, value);
              } else {
                this.emit(`option:${option.name()}`);
              }
              activeVariadicOption = option.variadic ? option : null;
              continue;
            }
          }
          if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
            const option = this._findOption(`-${arg[1]}`);
            if (option) {
              if (option.required || option.optional && this._combineFlagAndOptionalValue) {
                this.emit(`option:${option.name()}`, arg.slice(2));
              } else {
                this.emit(`option:${option.name()}`);
                args.unshift(`-${arg.slice(2)}`);
              }
              continue;
            }
          }
          if (/^--[^=]+=/.test(arg)) {
            const index = arg.indexOf("=");
            const option = this._findOption(arg.slice(0, index));
            if (option && (option.required || option.optional)) {
              this.emit(`option:${option.name()}`, arg.slice(index + 1));
              continue;
            }
          }
          if (maybeOption(arg)) {
            dest = unknown;
          }
          if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
            if (this._findCommand(arg)) {
              operands.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            } else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
              operands.push(arg);
              if (args.length > 0) operands.push(...args);
              break;
            } else if (this._defaultCommandName) {
              unknown.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            }
          }
          if (this._passThroughOptions) {
            dest.push(arg);
            if (args.length > 0) dest.push(...args);
            break;
          }
          dest.push(arg);
        }
        return { operands, unknown };
      }
      /**
       * Return an object containing local option values as key-value pairs.
       *
       * @return {object}
       */
      opts() {
        if (this._storeOptionsAsProperties) {
          const result = {};
          const len = this.options.length;
          for (let i = 0; i < len; i++) {
            const key = this.options[i].attributeName();
            result[key] = key === this._versionOptionName ? this._version : this[key];
          }
          return result;
        }
        return this._optionValues;
      }
      /**
       * Return an object containing merged local and global option values as key-value pairs.
       *
       * @return {object}
       */
      optsWithGlobals() {
        return this._getCommandAndAncestors().reduce(
          (combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()),
          {}
        );
      }
      /**
       * Display error message and exit (or call exitOverride).
       *
       * @param {string} message
       * @param {object} [errorOptions]
       * @param {string} [errorOptions.code] - an id string representing the error
       * @param {number} [errorOptions.exitCode] - used with process.exit
       */
      error(message, errorOptions) {
        this._outputConfiguration.outputError(
          `${message}
`,
          this._outputConfiguration.writeErr
        );
        if (typeof this._showHelpAfterError === "string") {
          this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
        } else if (this._showHelpAfterError) {
          this._outputConfiguration.writeErr("\n");
          this.outputHelp({ error: true });
        }
        const config = errorOptions || {};
        const exitCode = config.exitCode || 1;
        const code = config.code || "commander.error";
        this._exit(exitCode, code, message);
      }
      /**
       * Apply any option related environment variables, if option does
       * not have a value from cli or client code.
       *
       * @private
       */
      _parseOptionsEnv() {
        this.options.forEach((option) => {
          if (option.envVar && option.envVar in process2.env) {
            const optionKey = option.attributeName();
            if (this.getOptionValue(optionKey) === void 0 || ["default", "config", "env"].includes(
              this.getOptionValueSource(optionKey)
            )) {
              if (option.required || option.optional) {
                this.emit(`optionEnv:${option.name()}`, process2.env[option.envVar]);
              } else {
                this.emit(`optionEnv:${option.name()}`);
              }
            }
          }
        });
      }
      /**
       * Apply any implied option values, if option is undefined or default value.
       *
       * @private
       */
      _parseOptionsImplied() {
        const dualHelper = new DualOptions(this.options);
        const hasCustomOptionValue = (optionKey) => {
          return this.getOptionValue(optionKey) !== void 0 && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
        };
        this.options.filter(
          (option) => option.implied !== void 0 && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(
            this.getOptionValue(option.attributeName()),
            option
          )
        ).forEach((option) => {
          Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
            this.setOptionValueWithSource(
              impliedKey,
              option.implied[impliedKey],
              "implied"
            );
          });
        });
      }
      /**
       * Argument `name` is missing.
       *
       * @param {string} name
       * @private
       */
      missingArgument(name2) {
        const message = `error: missing required argument '${name2}'`;
        this.error(message, { code: "commander.missingArgument" });
      }
      /**
       * `Option` is missing an argument.
       *
       * @param {Option} option
       * @private
       */
      optionMissingArgument(option) {
        const message = `error: option '${option.flags}' argument missing`;
        this.error(message, { code: "commander.optionMissingArgument" });
      }
      /**
       * `Option` does not have a value, and is a mandatory option.
       *
       * @param {Option} option
       * @private
       */
      missingMandatoryOptionValue(option) {
        const message = `error: required option '${option.flags}' not specified`;
        this.error(message, { code: "commander.missingMandatoryOptionValue" });
      }
      /**
       * `Option` conflicts with another option.
       *
       * @param {Option} option
       * @param {Option} conflictingOption
       * @private
       */
      _conflictingOption(option, conflictingOption) {
        const findBestOptionFromValue = (option2) => {
          const optionKey = option2.attributeName();
          const optionValue = this.getOptionValue(optionKey);
          const negativeOption = this.options.find(
            (target) => target.negate && optionKey === target.attributeName()
          );
          const positiveOption = this.options.find(
            (target) => !target.negate && optionKey === target.attributeName()
          );
          if (negativeOption && (negativeOption.presetArg === void 0 && optionValue === false || negativeOption.presetArg !== void 0 && optionValue === negativeOption.presetArg)) {
            return negativeOption;
          }
          return positiveOption || option2;
        };
        const getErrorMessage = (option2) => {
          const bestOption = findBestOptionFromValue(option2);
          const optionKey = bestOption.attributeName();
          const source = this.getOptionValueSource(optionKey);
          if (source === "env") {
            return `environment variable '${bestOption.envVar}'`;
          }
          return `option '${bestOption.flags}'`;
        };
        const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
        this.error(message, { code: "commander.conflictingOption" });
      }
      /**
       * Unknown option `flag`.
       *
       * @param {string} flag
       * @private
       */
      unknownOption(flag) {
        if (this._allowUnknownOption) return;
        let suggestion = "";
        if (flag.startsWith("--") && this._showSuggestionAfterError) {
          let candidateFlags = [];
          let command = this;
          do {
            const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
            candidateFlags = candidateFlags.concat(moreFlags);
            command = command.parent;
          } while (command && !command._enablePositionalOptions);
          suggestion = suggestSimilar(flag, candidateFlags);
        }
        const message = `error: unknown option '${flag}'${suggestion}`;
        this.error(message, { code: "commander.unknownOption" });
      }
      /**
       * Excess arguments, more than expected.
       *
       * @param {string[]} receivedArgs
       * @private
       */
      _excessArguments(receivedArgs) {
        if (this._allowExcessArguments) return;
        const expected = this.registeredArguments.length;
        const s = expected === 1 ? "" : "s";
        const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
        const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
        this.error(message, { code: "commander.excessArguments" });
      }
      /**
       * Unknown command.
       *
       * @private
       */
      unknownCommand() {
        const unknownName = this.args[0];
        let suggestion = "";
        if (this._showSuggestionAfterError) {
          const candidateNames = [];
          this.createHelp().visibleCommands(this).forEach((command) => {
            candidateNames.push(command.name());
            if (command.alias()) candidateNames.push(command.alias());
          });
          suggestion = suggestSimilar(unknownName, candidateNames);
        }
        const message = `error: unknown command '${unknownName}'${suggestion}`;
        this.error(message, { code: "commander.unknownCommand" });
      }
      /**
       * Get or set the program version.
       *
       * This method auto-registers the "-V, --version" option which will print the version number.
       *
       * You can optionally supply the flags and description to override the defaults.
       *
       * @param {string} [str]
       * @param {string} [flags]
       * @param {string} [description]
       * @return {(this | string | undefined)} `this` command for chaining, or version string if no arguments
       */
      version(str2, flags, description) {
        if (str2 === void 0) return this._version;
        this._version = str2;
        flags = flags || "-V, --version";
        description = description || "output the version number";
        const versionOption = this.createOption(flags, description);
        this._versionOptionName = versionOption.attributeName();
        this._registerOption(versionOption);
        this.on("option:" + versionOption.name(), () => {
          this._outputConfiguration.writeOut(`${str2}
`);
          this._exit(0, "commander.version", str2);
        });
        return this;
      }
      /**
       * Set the description.
       *
       * @param {string} [str]
       * @param {object} [argsDescription]
       * @return {(string|Command)}
       */
      description(str2, argsDescription) {
        if (str2 === void 0 && argsDescription === void 0)
          return this._description;
        this._description = str2;
        if (argsDescription) {
          this._argsDescription = argsDescription;
        }
        return this;
      }
      /**
       * Set the summary. Used when listed as subcommand of parent.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      summary(str2) {
        if (str2 === void 0) return this._summary;
        this._summary = str2;
        return this;
      }
      /**
       * Set an alias for the command.
       *
       * You may call more than once to add multiple aliases. Only the first alias is shown in the auto-generated help.
       *
       * @param {string} [alias]
       * @return {(string|Command)}
       */
      alias(alias) {
        if (alias === void 0) return this._aliases[0];
        let command = this;
        if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
          command = this.commands[this.commands.length - 1];
        }
        if (alias === command._name)
          throw new Error("Command alias can't be the same as its name");
        const matchingCommand = this.parent?._findCommand(alias);
        if (matchingCommand) {
          const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
          throw new Error(
            `cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`
          );
        }
        command._aliases.push(alias);
        return this;
      }
      /**
       * Set aliases for the command.
       *
       * Only the first alias is shown in the auto-generated help.
       *
       * @param {string[]} [aliases]
       * @return {(string[]|Command)}
       */
      aliases(aliases) {
        if (aliases === void 0) return this._aliases;
        aliases.forEach((alias) => this.alias(alias));
        return this;
      }
      /**
       * Set / get the command usage `str`.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      usage(str2) {
        if (str2 === void 0) {
          if (this._usage) return this._usage;
          const args = this.registeredArguments.map((arg) => {
            return humanReadableArgName(arg);
          });
          return [].concat(
            this.options.length || this._helpOption !== null ? "[options]" : [],
            this.commands.length ? "[command]" : [],
            this.registeredArguments.length ? args : []
          ).join(" ");
        }
        this._usage = str2;
        return this;
      }
      /**
       * Get or set the name of the command.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      name(str2) {
        if (str2 === void 0) return this._name;
        this._name = str2;
        return this;
      }
      /**
       * Set the name of the command from script filename, such as process.argv[1],
       * or require.main.filename, or __filename.
       *
       * (Used internally and public although not documented in README.)
       *
       * @example
       * program.nameFromFilename(require.main.filename);
       *
       * @param {string} filename
       * @return {Command}
       */
      nameFromFilename(filename) {
        this._name = path6.basename(filename, path6.extname(filename));
        return this;
      }
      /**
       * Get or set the directory for searching for executable subcommands of this command.
       *
       * @example
       * program.executableDir(__dirname);
       * // or
       * program.executableDir('subcommands');
       *
       * @param {string} [path]
       * @return {(string|null|Command)}
       */
      executableDir(path7) {
        if (path7 === void 0) return this._executableDir;
        this._executableDir = path7;
        return this;
      }
      /**
       * Return program help documentation.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to wrap for stderr instead of stdout
       * @return {string}
       */
      helpInformation(contextOptions) {
        const helper = this.createHelp();
        if (helper.helpWidth === void 0) {
          helper.helpWidth = contextOptions && contextOptions.error ? this._outputConfiguration.getErrHelpWidth() : this._outputConfiguration.getOutHelpWidth();
        }
        return helper.formatHelp(this, helper);
      }
      /**
       * @private
       */
      _getHelpContext(contextOptions) {
        contextOptions = contextOptions || {};
        const context = { error: !!contextOptions.error };
        let write;
        if (context.error) {
          write = (arg) => this._outputConfiguration.writeErr(arg);
        } else {
          write = (arg) => this._outputConfiguration.writeOut(arg);
        }
        context.write = contextOptions.write || write;
        context.command = this;
        return context;
      }
      /**
       * Output help information for this command.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean } | Function} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      outputHelp(contextOptions) {
        let deprecatedCallback;
        if (typeof contextOptions === "function") {
          deprecatedCallback = contextOptions;
          contextOptions = void 0;
        }
        const context = this._getHelpContext(contextOptions);
        this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", context));
        this.emit("beforeHelp", context);
        let helpInformation = this.helpInformation(context);
        if (deprecatedCallback) {
          helpInformation = deprecatedCallback(helpInformation);
          if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
            throw new Error("outputHelp callback must return a string or a Buffer");
          }
        }
        context.write(helpInformation);
        if (this._getHelpOption()?.long) {
          this.emit(this._getHelpOption().long);
        }
        this.emit("afterHelp", context);
        this._getCommandAndAncestors().forEach(
          (command) => command.emit("afterAllHelp", context)
        );
      }
      /**
       * You can pass in flags and a description to customise the built-in help option.
       * Pass in false to disable the built-in help option.
       *
       * @example
       * program.helpOption('-?, --help' 'show help'); // customise
       * program.helpOption(false); // disable
       *
       * @param {(string | boolean)} flags
       * @param {string} [description]
       * @return {Command} `this` command for chaining
       */
      helpOption(flags, description) {
        if (typeof flags === "boolean") {
          if (flags) {
            this._helpOption = this._helpOption ?? void 0;
          } else {
            this._helpOption = null;
          }
          return this;
        }
        flags = flags ?? "-h, --help";
        description = description ?? "display help for command";
        this._helpOption = this.createOption(flags, description);
        return this;
      }
      /**
       * Lazy create help option.
       * Returns null if has been disabled with .helpOption(false).
       *
       * @returns {(Option | null)} the help option
       * @package
       */
      _getHelpOption() {
        if (this._helpOption === void 0) {
          this.helpOption(void 0, void 0);
        }
        return this._helpOption;
      }
      /**
       * Supply your own option to use for the built-in help option.
       * This is an alternative to using helpOption() to customise the flags and description etc.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addHelpOption(option) {
        this._helpOption = option;
        return this;
      }
      /**
       * Output help information and exit.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      help(contextOptions) {
        this.outputHelp(contextOptions);
        let exitCode = process2.exitCode || 0;
        if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
          exitCode = 1;
        }
        this._exit(exitCode, "commander.help", "(outputHelp)");
      }
      /**
       * Add additional text to be displayed with the built-in help.
       *
       * Position is 'before' or 'after' to affect just this command,
       * and 'beforeAll' or 'afterAll' to affect this command and all its subcommands.
       *
       * @param {string} position - before or after built-in help
       * @param {(string | Function)} text - string to add, or a function returning a string
       * @return {Command} `this` command for chaining
       */
      addHelpText(position, text) {
        const allowedValues = ["beforeAll", "before", "after", "afterAll"];
        if (!allowedValues.includes(position)) {
          throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        const helpEvent = `${position}Help`;
        this.on(helpEvent, (context) => {
          let helpStr;
          if (typeof text === "function") {
            helpStr = text({ error: context.error, command: context.command });
          } else {
            helpStr = text;
          }
          if (helpStr) {
            context.write(`${helpStr}
`);
          }
        });
        return this;
      }
      /**
       * Output help information if help flags specified
       *
       * @param {Array} args - array of options to search for help flags
       * @private
       */
      _outputHelpIfRequested(args) {
        const helpOption = this._getHelpOption();
        const helpRequested = helpOption && args.find((arg) => helpOption.is(arg));
        if (helpRequested) {
          this.outputHelp();
          this._exit(0, "commander.helpDisplayed", "(outputHelp)");
        }
      }
    };
    function incrementNodeInspectorPort(args) {
      return args.map((arg) => {
        if (!arg.startsWith("--inspect")) {
          return arg;
        }
        let debugOption;
        let debugHost = "127.0.0.1";
        let debugPort = "9229";
        let match;
        if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
          debugOption = match[1];
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
          debugOption = match[1];
          if (/^\d+$/.test(match[3])) {
            debugPort = match[3];
          } else {
            debugHost = match[3];
          }
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
          debugOption = match[1];
          debugHost = match[3];
          debugPort = match[4];
        }
        if (debugOption && debugPort !== "0") {
          return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
        }
        return arg;
      });
    }
    exports.Command = Command2;
  }
});

// node_modules/commander/index.js
var require_commander = __commonJS({
  "node_modules/commander/index.js"(exports) {
    var { Argument: Argument2 } = require_argument();
    var { Command: Command2 } = require_command();
    var { CommanderError: CommanderError2, InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2 } = require_option();
    exports.program = new Command2();
    exports.createCommand = (name2) => new Command2(name2);
    exports.createOption = (flags, description) => new Option2(flags, description);
    exports.createArgument = (name2, description) => new Argument2(name2, description);
    exports.Command = Command2;
    exports.Option = Option2;
    exports.Argument = Argument2;
    exports.Help = Help2;
    exports.CommanderError = CommanderError2;
    exports.InvalidArgumentError = InvalidArgumentError2;
    exports.InvalidOptionArgumentError = InvalidArgumentError2;
  }
});

// packages/cli/src/main.ts
import { execFile as execFile4 } from "node:child_process";
import { accessSync, constants as fsConstants, readdirSync as readdirSync6, readFileSync as readFileSync19, statSync as statSync5 } from "node:fs";
import { access as access2, readdir as readdir5, readFile as readFile7, stat as stat8, writeFile as writeFile10 } from "node:fs/promises";
import { homedir as homedir8 } from "node:os";
import { dirname as dirname9, join as join35 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// node_modules/commander/esm.mjs
var import_index = __toESM(require_commander(), 1);
var {
  program,
  createCommand,
  createArgument,
  createOption,
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
  // deprecated old name
  Command,
  Argument,
  Option,
  Help
} = import_index.default;

// packages/kernel/dist/types.js
var FIELD_ORDER = [
  "track",
  "preset",
  "created_by",
  "assignee",
  "phase",
  "phase_status",
  "design_doc",
  "plan",
  "verification_report",
  "build_mode",
  "isolation",
  "build_sha",
  "agent_review_result",
  "codex_review_result",
  "verify_result",
  "branch_status",
  "direct_override",
  "prd_path",
  "pr_url",
  "automation",
  "automation_queued_at",
  "automation_sandbox",
  "automation_worktree",
  "automation_attempts",
  "automation_last_error",
  "automation_preserved_path",
  "branch",
  "base_branch",
  "scope",
  "related_files",
  "spec_scope",
  "depends_on",
  "created_at",
  "updated_at",
  "verified_at",
  "archived_at",
  "archived",
  "workflow",
  // v5 T4（决策 G）：沙箱内当前阶段（automation runner 检出 [TRANSITION] 行运行期回写；run 结算
  // 清空）。host 阶段（phase 字段）在 run 结束后才结算，两者并存不冲突。**新字段必须追加在末尾**
  // （同 workflow 先例）：老版本窄解析器遇到首个未知 key 起整段进 opaqueTail——新字段若插在中段，
  // 老读者会把其后所有真字段（branch/base_branch/workflow…）当不透明尾巴，回写时用缺省值再造一份
  // → 重复 key 静默腐蚀；放末尾则老读者只把这一行当尾巴逐字保留，混版本读写无损。
  "automation_current_phase",
  // F-b（2026-07-13）：失败成因结构化 tag——automation 写入端按 error _tag 干净判定落盘
  // （cancelled/conflict/timeout/verify-fail/agent-exit/no-op，开放集），空串=未知（基础设施类
  // 不写，读取端 fallback regex 分类 automation_last_error 文本）。与 automation_last_error
  // **同写同清**（写点见 automation scheduler/lifecycle/sdk），杜绝「消息换了、成因还是旧的」撕裂。
  // 末尾追加理由同 automation_current_phase（老窄解析器 opaqueTail 腐蚀警告见上）。
  "automation_cause"
];
var LIST_FIELDS = ["scope", "related_files", "spec_scope", "depends_on"];
var PHASES = ["open", "explore", "spec", "build", "verify", "ship", "archive"];
var TRACKS = ["chat", "pm", "frontend", "backend"];
var GATE_TTL_MS = {
  confirm: 3e5,
  review: 18e5,
  interaction: 18e5
};
var GATE_FRESH_MS = 15 * 60 * 1e3;
var SANDCASTLE_BUILD_HINT = "bash tools/sandcastle/build.sh";
var PREREQ_HINTS = {
  /** claude-code 凭证 CLAUDE_CODE_OAUTH_TOKEN 缺 —— 生成长期 OAuth token。 */
  claudeToken: "\u8FD0\u884C `claude setup-token` \u751F\u6210\u957F\u671F OAuth token",
  /** codex 凭证 OPENAI_API_KEY 缺 —— 两条路(ChatGPT 账户登录 / 建 API key)。 */
  openaiKey: "codex \u4E24\u6761\u8DEF\uFF1A\u2460 `codex login` \u8D70 ChatGPT \u8D26\u6237\uFF08\u6700\u7B80\uFF0C\u514D API key\uFF09\uFF1B\u2461 \u5230 platform.openai.com/api-keys \u5EFA key \u8BBE\u4E3A OPENAI_API_KEY",
  /** docker daemon 不可用 —— 装 OrbStack 或 Docker Desktop（不自动装，需用户自行安装）。 */
  docker: "\u88C5 OrbStack\uFF08orbstack.dev\uFF0C\u8F7B\u91CF\uFF0C\u63A8\u8350 macOS\uFF09\u6216 Docker Desktop\uFF08docker.com\uFF09\u2014\u2014\u4E0D\u81EA\u52A8\u88C5\uFF0C\u9700\u4F60\u81EA\u884C\u5B89\u88C5"
};
var IllegalTransitionError = class extends Error {
  from;
  to;
  constructor(from, to) {
    super(`illegal transition: ${from} -> ${to}`);
    this.from = from;
    this.to = to;
  }
};
var QuoteGateError = class extends Error {
  field;
  reason;
  constructor(field2, reason) {
    super(`quote gate rejected write to ${field2}: ${reason}`);
    this.field = field2;
    this.reason = reason;
  }
};

// packages/kernel/dist/state/store.js
import { mkdir as mkdir2, readFile as readFile2, rename as rename2, stat as stat2, writeFile as writeFile2 } from "node:fs/promises";
import path2 from "node:path";

// packages/kernel/dist/state/lock.js
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
var LOCK_DIR_NAME = ".pipeline.lock";
var LOCK_OWNER_FILE = "owner";
var STALE_LOCK_MS = 6e4;
var HEARTBEAT_MS = Math.floor(STALE_LOCK_MS / 3);
var ACQUIRE_TIMEOUT_MS = 1e4;
var POLL_MS = 10;
var queues = /* @__PURE__ */ new Map();
function lockDirFor(changeDir2) {
  return path.join(path.resolve(changeDir2), LOCK_DIR_NAME);
}
function ownerPathFor(lockDir) {
  return path.join(lockDir, LOCK_OWNER_FILE);
}
async function lockAgeMs(lockDir) {
  try {
    const st = await stat(ownerPathFor(lockDir));
    return Date.now() - st.mtimeMs;
  } catch {
    try {
      const st = await stat(lockDir);
      return Date.now() - st.mtimeMs;
    } catch {
      return null;
    }
  }
}
async function reclaimStale(lockDir) {
  const grave = `${lockDir}.stale.${process.pid}.${randomBytes(6).toString("hex")}`;
  try {
    await rename(lockDir, grave);
  } catch {
    return;
  }
  await rm(grave, { recursive: true, force: true }).catch(() => {
  });
}
function startHeartbeat(lockDir) {
  const owner = ownerPathFor(lockDir);
  const t = setInterval(() => {
    const now = /* @__PURE__ */ new Date();
    void utimes(owner, now, now).catch(() => {
    });
  }, HEARTBEAT_MS);
  if (typeof t.unref === "function")
    t.unref();
  return t;
}
async function acquire(lockDir) {
  const token = `${process.pid}.${randomBytes(8).toString("hex")}.${Date.now()}`;
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS;
  for (; ; ) {
    let created = false;
    try {
      await mkdir(lockDir);
      created = true;
      await writeFile(ownerPathFor(lockDir), `${token}
`, "utf8");
      return { token, heartbeat: startHeartbeat(lockDir) };
    } catch (err) {
      if (created) {
        await rm(lockDir, { recursive: true, force: true }).catch(() => {
        });
        throw err;
      }
      if (err.code !== "EEXIST")
        throw err;
    }
    const age = await lockAgeMs(lockDir);
    if (age === null)
      continue;
    if (age > STALE_LOCK_MS) {
      await reclaimStale(lockDir);
      continue;
    }
    if (Date.now() >= deadline) {
      throw new Error(`withLock: acquire timeout after ${ACQUIRE_TIMEOUT_MS}ms: ${lockDir}`);
    }
    await sleep(POLL_MS);
  }
}
async function release(lockDir, held) {
  clearInterval(held.heartbeat);
  let owner = null;
  try {
    owner = (await readFile(ownerPathFor(lockDir), "utf8")).trim();
  } catch {
    owner = null;
  }
  if (owner !== held.token)
    return;
  await rm(lockDir, { recursive: true, force: true }).catch(() => {
  });
}
async function withLock(changeDir2, fn) {
  const lockDir = lockDirFor(changeDir2);
  const prev = queues.get(lockDir) ?? Promise.resolve();
  const run = prev.then(async () => {
    const held = await acquire(lockDir);
    try {
      return await fn();
    } finally {
      await release(lockDir, held);
    }
  });
  const settled = run.then(() => void 0, () => void 0);
  queues.set(lockDir, settled);
  void settled.then(() => {
    if (queues.get(lockDir) === settled)
      queues.delete(lockDir);
  });
  return run;
}

// packages/kernel/dist/state/parse.js
var KNOWN_FIELDS = new Set(FIELD_ORDER);
var LIST_FIELD_SET = new Set(LIST_FIELDS);
var LIST_ITEM_PREFIX = "  - ";
var KEY_RE = /^([A-Za-z0-9_]+):(.*)$/;
function unquoteScalar(s) {
  if (s.length >= 2) {
    const first = s.charAt(0);
    const last = s.charAt(s.length - 1);
    if (first === last && (first === '"' || first === "'"))
      return s.slice(1, -1);
  }
  return s;
}
function emptyFields() {
  const fields = {};
  for (const f of FIELD_ORDER)
    fields[f] = f === "workflow" ? "default" : "";
  return fields;
}
function quoteGate(field2, value) {
  if (value.includes("\n") || value.includes("\r")) {
    throw new QuoteGateError(field2, "value contains a newline/carriage return (would inject fake fields)");
  }
  if (value.includes(": ")) {
    throw new QuoteGateError(field2, 'value contains ": " (would break YAML parsing)');
  }
  if (value.includes(" #")) {
    throw new QuoteGateError(field2, 'value contains " #" (would be eaten as an inline comment)');
  }
  const first = value.charAt(0);
  if (first === '"' || first === "'") {
    throw new QuoteGateError(field2, "value starts with a quote (would break YAML parsing)");
  }
}
function parsePipeline(content) {
  const lines = content.split("\n");
  const fields = emptyFields();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const m = KEY_RE.exec(line);
    if (!m)
      break;
    const key = m[1] ?? "";
    if (!KNOWN_FIELDS.has(key))
      break;
    const field2 = key;
    const rest = (m[2] ?? "").trim();
    i++;
    if (LIST_FIELD_SET.has(field2)) {
      if (rest === "") {
        const items = [];
        while (i < lines.length && (lines[i] ?? "").startsWith(LIST_ITEM_PREFIX)) {
          items.push(unquoteScalar((lines[i] ?? "").slice(LIST_ITEM_PREFIX.length).trim()));
          i++;
        }
        fields[field2] = items;
      } else if (rest === "[]") {
        fields[field2] = [];
      } else {
        fields[field2] = unquoteScalar(rest);
      }
    } else {
      fields[field2] = unquoteScalar(rest);
    }
  }
  return { fields, opaqueTail: lines.slice(i).join("\n") };
}
function serializePipeline(state) {
  const out = [];
  for (const field2 of FIELD_ORDER) {
    const value = state.fields[field2] ?? "";
    if (Array.isArray(value)) {
      for (const item of value)
        quoteGate(field2, item);
      if (value.length === 0) {
        out.push(`${field2}: []`);
      } else {
        out.push(`${field2}:`);
        for (const item of value)
          out.push(`${LIST_ITEM_PREFIX}${item}`);
      }
    } else {
      quoteGate(field2, value);
      out.push(`${field2}: ${value === "" ? '""' : value}`);
    }
  }
  return out.join("\n") + "\n" + state.opaqueTail;
}

// packages/kernel/dist/state/store.js
var STATE_FILE_NAME = ".pipeline.yaml";
var CHANGE_NAME_RE = /^[a-zA-Z0-9_-]+$/;
function defaultClock() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d+Z$/, "Z");
}
function stateFilePath(changeDir2) {
  return path2.join(changeDir2, STATE_FILE_NAME);
}
var tmpSeq = 0;
async function atomicWriteFile(file, data) {
  const tmp = `${file}.tmp.${process.pid}.${tmpSeq++}`;
  await writeFile2(tmp, data, "utf8");
  await rename2(tmp, file);
}
async function detectBaseBranch(repoRoot) {
  try {
    const gitPath = path2.join(repoRoot, ".git");
    let gitDir = gitPath;
    const st = await stat2(gitPath);
    if (!st.isDirectory()) {
      const pointer = await readFile2(gitPath, "utf8");
      const pm = /^gitdir:\s*(.+)$/m.exec(pointer);
      if (!pm)
        return "main";
      gitDir = path2.resolve(repoRoot, pm[1].trim());
    }
    const head = await readFile2(path2.join(gitDir, "HEAD"), "utf8");
    const m = /^ref: refs\/heads\/(\S+)$/.exec(head.trim());
    const branch = m?.[1];
    if (branch)
      return branch;
  } catch {
  }
  return "main";
}
function initialFields(opts, ts, baseBranch) {
  const reviewInit = opts.track === "pm" ? "skipped" : "pending";
  const f = emptyFields();
  f.track = opts.track;
  f.preset = opts.preset;
  f.created_by = "unknown";
  f.assignee = "null";
  f.phase = "open";
  f.phase_status = "pending";
  f.design_doc = "null";
  f.plan = "null";
  f.verification_report = "null";
  f.build_mode = "null";
  f.isolation = "null";
  f.build_sha = "null";
  f.agent_review_result = reviewInit;
  f.codex_review_result = reviewInit;
  f.verify_result = "pending";
  f.branch_status = "pending";
  f.direct_override = "false";
  f.prd_path = "null";
  f.pr_url = "null";
  f.automation = "off";
  f.automation_queued_at = "";
  f.automation_sandbox = "";
  f.automation_worktree = "";
  f.automation_attempts = "0";
  f.automation_last_error = "";
  f.automation_preserved_path = "";
  f.branch = "null";
  f.base_branch = baseBranch;
  f.scope = "null";
  f.related_files = "null";
  f.spec_scope = "null";
  f.depends_on = "null";
  f.created_at = ts;
  f.updated_at = ts;
  f.verified_at = "null";
  f.archived_at = "null";
  f.archived = "false";
  f.automation_current_phase = "";
  f.automation_cause = "";
  return f;
}
function gateValue(field2, value) {
  if (Array.isArray(value)) {
    for (const item of value)
      quoteGate(field2, item);
  } else {
    quoteGate(field2, value);
  }
}
var FsStateStore = class {
  async read(changeDir2) {
    return parsePipeline(await readFile2(stateFilePath(changeDir2), "utf8"));
  }
  async write(changeDir2, state) {
    await atomicWriteFile(stateFilePath(changeDir2), serializePipeline(state));
  }
  async get(changeDir2, field2) {
    const state = await this.read(changeDir2);
    return state.fields[field2];
  }
  async set(changeDir2, field2, value) {
    await this.setMany(changeDir2, { [field2]: value });
  }
  async setMany(changeDir2, kv) {
    const entries = Object.entries(kv).filter((e) => e[1] !== void 0);
    for (const [field2, value] of entries)
      gateValue(field2, value);
    if (entries.length === 0)
      return;
    await withLock(changeDir2, async () => {
      const state = await this.read(changeDir2);
      for (const [field2, value] of entries)
        state.fields[field2] = value;
      await this.write(changeDir2, state);
    });
  }
  async cas(changeDir2, field2, expect, next) {
    quoteGate(field2, next);
    return withLock(changeDir2, async () => {
      const state = await this.read(changeDir2);
      if (state.fields[field2] !== expect)
        return false;
      state.fields[field2] = next;
      await this.write(changeDir2, state);
      return true;
    });
  }
  async init(opts) {
    const { name: name2 } = opts;
    if (!CHANGE_NAME_RE.test(name2) || name2.includes("..")) {
      throw new Error(`init: \u975E\u6CD5 change \u540D '${name2}'\uFF08\u4EC5\u5141\u8BB8 a-zA-Z0-9_-\uFF0C\u7981 ..\uFF09`);
    }
    const clock = opts.clock ?? defaultClock;
    const changeDir2 = path2.join(path2.resolve(opts.repoRoot), "openspec", "changes", name2);
    await mkdir2(changeDir2, { recursive: true });
    const ts = clock();
    const baseBranch = await detectBaseBranch(opts.repoRoot);
    const state = { fields: initialFields(opts, ts, baseBranch), opaqueTail: "" };
    const content = serializePipeline(state);
    await writeFile2(stateFilePath(changeDir2), content, { encoding: "utf8", flag: "wx" });
    if (opts.user !== void 0 && opts.user !== "" && opts.user !== "unknown") {
      try {
        await this.set(changeDir2, "created_by", opts.user);
      } catch (err) {
        if (!(err instanceof QuoteGateError))
          throw err;
      }
    }
    return changeDir2;
  }
  async withLock(changeDir2, fn) {
    return withLock(changeDir2, fn);
  }
};
function createStateStore() {
  return new FsStateStore();
}

// packages/kernel/dist/state/history.js
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
var HISTORY_FILE = ".pipeline-history.jsonl";
function createHistoryWriter() {
  return {
    async append(changeDir2, entry) {
      await appendFile(join(changeDir2, HISTORY_FILE), `${JSON.stringify(entry)}
`, "utf8");
    }
  };
}

// packages/kernel/dist/state/projectRegistry.js
import { readFileSync } from "node:fs";
import { mkdir as mkdir3, rename as rename3, writeFile as writeFile3 } from "node:fs/promises";
import { dirname, join as join2, resolve as resolvePath } from "node:path";
var PROJECT_REGISTRY_FILE = "pipeline-projects.json";
function projectRegistryPath(home) {
  return join2(home, ".claude", PROJECT_REGISTRY_FILE);
}
function readProjectRegistry(registryPath) {
  try {
    const data = JSON.parse(readFileSync(registryPath, "utf8"));
    return Array.isArray(data) ? data.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}
var tmpSeq2 = 0;
async function writeProjectRegistry(registryPath, roots) {
  await mkdir3(dirname(registryPath), { recursive: true });
  const tmp = `${registryPath}.tmp.${process.pid}.${tmpSeq2++}`;
  await writeFile3(tmp, `${JSON.stringify(roots, null, 2)}
`, "utf8");
  await rename3(tmp, registryPath);
}
async function registerProjectRoot(registryPath, rawRoot) {
  const normalized = resolvePath(rawRoot);
  const dir = dirname(registryPath);
  await mkdir3(dir, { recursive: true });
  return withLock(dir, async () => {
    const existing = readProjectRegistry(registryPath);
    if (existing.some((e) => e && resolvePath(e) === normalized))
      return false;
    await writeProjectRegistry(registryPath, [...existing, normalized]);
    return true;
  });
}

// packages/kernel/dist/state/secrets.js
import { existsSync, readFileSync as readFileSync2 } from "node:fs";
import { dirname as dirname2, join as join3 } from "node:path";
var SECRETS_FILE_NAME = "pipeline-secrets.json";
var SECRET_KEYS = ["CLAUDE_CODE_OAUTH_TOKEN", "OPENAI_API_KEY"];
function secretsPath(home) {
  return join3(home, ".claude", SECRETS_FILE_NAME);
}
function readSecrets(path6) {
  try {
    const parsed = JSON.parse(readFileSync2(path6, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return { version: 1, keys: {} };
    const rawKeys = parsed.keys;
    if (typeof rawKeys !== "object" || rawKeys === null || Array.isArray(rawKeys))
      return { version: 1, keys: {} };
    const keys = {};
    for (const k of SECRET_KEYS) {
      const v = rawKeys[k];
      if (typeof v === "string" && v !== "")
        keys[k] = v;
    }
    return { version: 1, keys };
  } catch {
    return { version: 1, keys: {} };
  }
}

// packages/kernel/dist/state/legacy.js
var SECTION_KIND = {
  tools_history: "tool",
  prompts_history: "prompt",
  transitions_history: "transition"
};
function b64(s) {
  if (!s || s.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s))
    return void 0;
  try {
    return Buffer.from(s, "base64").toString("utf8");
  } catch {
    return void 0;
  }
}
function parseFlowMap(inner) {
  const out = {};
  let depth = false;
  let cur = "";
  const parts = [];
  for (const ch of inner) {
    if (ch === '"')
      depth = !depth;
    if (ch === "," && !depth) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim())
    parts.push(cur);
  for (const p of parts) {
    const i = p.indexOf(":");
    if (i <= 0)
      continue;
    const k = p.slice(0, i).trim();
    let v = p.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"'))
      v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}
function parseLegacyHistory(tail) {
  const entries = [];
  let kind = null;
  for (const line of tail.split("\n")) {
    const section = /^(\w+_history):\s*$/.exec(line);
    if (section) {
      kind = SECTION_KIND[section[1] ?? ""] ?? null;
      continue;
    }
    if (!line.startsWith("  ")) {
      if (line.trim() !== "")
        kind = null;
      continue;
    }
    if (!kind)
      continue;
    const m = /^\s*-\s*\{\s*(.*?)\s*\}\s*$/.exec(line);
    if (!m)
      continue;
    const kv = parseFlowMap(m[1] ?? "");
    const ts = kv.at ?? "";
    if (kind === "tool") {
      const detail = b64(kv.detail_b64) ?? kv.detail ?? "";
      entries.push({ ts, kind, raw: `${kv.tool ?? "?"}: ${detail}` });
    } else if (kind === "prompt") {
      entries.push({ ts, kind, raw: `Q: ${b64(kv.q_b64) ?? ""} | A: ${b64(kv.a_b64) ?? ""}` });
    } else {
      entries.push({ ts, kind, from: kv.from ?? "", to: kv.to ?? "", raw: kv.event ?? "" });
    }
  }
  return entries;
}
function stripLegacyHistory(tail) {
  if (tail === "")
    return "";
  const kept = [];
  let inSection = false;
  for (const line of tail.split("\n")) {
    const section = /^(\w+_history):\s*$/.exec(line);
    if (section && SECTION_KIND[section[1] ?? ""]) {
      inSection = true;
      continue;
    }
    if (inSection && /^\s+-\s/.test(line))
      continue;
    inSection = false;
    kept.push(line);
  }
  return kept.join("\n");
}

// packages/kernel/dist/state/tasks.js
import { readdir, stat as stat3 } from "node:fs/promises";
import path3 from "node:path";
var NULL_SENTINEL = "null";
function normalizeDeps(value) {
  if (value === void 0)
    return [];
  if (Array.isArray(value)) {
    return value.map((s) => s.trim()).filter((s) => s !== "");
  }
  const v = value.trim();
  if (v === "" || v === NULL_SENTINEL)
    return [];
  return v.split(",").map((s) => s.trim()).filter((s) => s !== "");
}
function addDependency(current, dep) {
  if (current.includes(dep))
    return { deps: [...current], added: false };
  return { deps: [...current, dep], added: true };
}
function removeDependency(current, dep) {
  return current.filter((d) => d !== dep);
}
function taskNameMatches(dep, target) {
  if (dep === target)
    return true;
  if (target.endsWith(`-${dep}`))
    return true;
  if (dep.endsWith(`-${target}`))
    return true;
  return false;
}
function directChildren(nodes, target) {
  const out = [];
  for (const node of nodes) {
    if (node.name === target)
      continue;
    if (node.deps.some((dep) => taskNameMatches(dep, target))) {
      out.push({ name: node.name, archived: node.archived });
    }
  }
  return out;
}
function cascadeDependents(nodes, target) {
  const visited = /* @__PURE__ */ new Set([target]);
  const result = [];
  let frontier = [target];
  while (frontier.length > 0) {
    const next = [];
    for (const nodeName of frontier) {
      for (const child of directChildren(nodes, nodeName)) {
        if (visited.has(child.name))
          continue;
        visited.add(child.name);
        next.push(child.name);
        result.push(child);
      }
    }
    frontier = next;
  }
  return result;
}
function nz(value) {
  const v = Array.isArray(value) ? value.join(",") : value ?? "";
  return v === "" || v === NULL_SENTINEL ? null : v;
}
function projectCanonical(input) {
  const f = input.fields;
  return {
    id: input.name,
    name: input.name,
    title: input.name,
    description: "",
    status: nz(f.phase) ?? "",
    dev_type: nz(f.track),
    scope: nz(f.scope),
    package: null,
    priority: "normal",
    creator: nz(f.created_by) ?? "",
    assignee: nz(f.assignee) ?? "",
    createdAt: nz(f.created_at) ?? "",
    completedAt: nz(f.archived_at),
    branch: nz(f.branch),
    base_branch: nz(f.base_branch),
    worktree_path: nz(f.automation_worktree),
    commit: nz(f.build_sha),
    pr_url: nz(f.pr_url),
    subtasks: input.subtasks,
    children: input.children,
    parent: null,
    relatedFiles: input.relatedFiles,
    notes: "",
    meta: {}
  };
}
function changesRootOf(cwd) {
  return path3.join(cwd, "openspec", "changes");
}
async function readDepsSafe(store2, dir) {
  try {
    const state = await store2.read(dir);
    return normalizeDeps(state.fields.depends_on);
  } catch {
    return void 0;
  }
}
async function walkArchive(dir, store2, nodes) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path3.join(dir, e.name);
    if (e.isDirectory()) {
      await walkArchive(full, store2, nodes);
    } else if (e.isFile() && e.name === STATE_FILE_NAME) {
      const deps = await readDepsSafe(store2, dir);
      if (deps !== void 0)
        nodes.push({ name: path3.basename(dir), archived: true, deps });
    }
  }
}
async function loadTaskTree(cwd, store2) {
  const root = changesRootOf(cwd);
  const nodes = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return nodes;
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name === "archive")
      continue;
    const deps = await readDepsSafe(store2, path3.join(root, e.name));
    if (deps === void 0)
      continue;
    nodes.push({ name: e.name, archived: false, deps });
  }
  await walkArchive(path3.join(root, "archive"), store2, nodes);
  nodes.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return nodes;
}
async function resolveChangeDir(cwd, name2) {
  const root = changesRootOf(cwd);
  const exact = path3.join(root, name2);
  try {
    if ((await stat3(exact)).isDirectory())
      return exact;
  } catch {
  }
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const hit = entries.find((e) => e.isDirectory() && e.name.endsWith(`-${name2}`));
    if (hit)
      return path3.join(root, hit.name);
  } catch {
  }
  return exact;
}
function canonicalChildNames(nodes, target) {
  return [...new Set(directChildren(nodes, target).map((c) => c.name))].sort();
}
function stateSubtasks(state) {
  return normalizeDeps(state.fields.depends_on);
}
function stateRelatedFiles(state) {
  return normalizeDeps(state.fields.related_files);
}

// packages/kernel/dist/state/spec.js
import { readdir as readdir2, readFile as readFile3, stat as stat4 } from "node:fs/promises";
import path4 from "node:path";
var SPECS_DIR = "openspec/specs";
var DOT_SPECS_DIR = ".openspec/specs";
var JSONL_DIR_MAXFILES = 20;
var VALID_AGENTS = /* @__PURE__ */ new Set(["implement", "check"]);
async function isDirAbs(p) {
  try {
    return (await stat4(p)).isDirectory();
  } catch {
    return false;
  }
}
async function isFileAbs(p) {
  try {
    return (await stat4(p)).isFile();
  } catch {
    return false;
  }
}
async function resolveSpecsDir(cwd) {
  let dir = SPECS_DIR;
  const primaryExists = await isDirAbs(path4.join(cwd, SPECS_DIR));
  if (!primaryExists && await isDirAbs(path4.join(cwd, DOT_SPECS_DIR)))
    dir = DOT_SPECS_DIR;
  const exists = await isDirAbs(path4.join(cwd, dir));
  return { dir, exists };
}
async function listSpecEntries(cwd) {
  const { dir, exists } = await resolveSpecsDir(cwd);
  if (!exists)
    return { dir, exists: false, entries: [] };
  const abs = path4.join(cwd, dir);
  let names = [];
  try {
    names = (await readdir2(abs, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    names = [];
  }
  const entries = [];
  for (const name2 of names) {
    const hasSpec = await isFileAbs(path4.join(cwd, dir, name2, "spec.md"));
    entries.push({ name: name2, specPath: hasSpec ? `${dir}/${name2}/spec.md` : "", hasSpec });
  }
  return { dir, exists: true, entries };
}
function specScopeWriteValue(scope) {
  return scope === void 0 || scope === "" ? "null" : scope;
}
function parseJsonlLine(line) {
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null)
    return null;
  const rec = obj;
  const file = rec.file;
  if (file === void 0 || file === null || file === false || file === "")
    return null;
  const fileStr = typeof file === "string" ? file : String(file);
  const t = rec.type;
  const type = t === void 0 || t === null || t === false ? "file" : typeof t === "string" ? t : String(t);
  return { file: fileStr, type };
}
function jsonlRelPath(name2, agent) {
  return `openspec/changes/${name2}/${agent}.jsonl`;
}
async function listMdFiles(cwd, dirRel) {
  let ents;
  try {
    ents = await readdir2(path4.join(cwd, dirRel), { withFileTypes: true });
  } catch {
    return [];
  }
  const base = dirRel.replace(/\/+$/, "");
  return ents.filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => `${base}/${e.name}`).sort();
}
async function injectJsonl(cwd, name2, agent) {
  if (!VALID_AGENTS.has(agent)) {
    return { kind: "bad-agent", jsonlPath: "", chunks: [], warnings: [], sawReal: false };
  }
  const rel = jsonlRelPath(name2, agent);
  const abs = path4.join(cwd, rel);
  if (!await isFileAbs(abs)) {
    return { kind: "missing", jsonlPath: rel, chunks: [], warnings: [], sawReal: false };
  }
  let text;
  try {
    text = await readFile3(abs, "utf8");
  } catch {
    return { kind: "missing", jsonlPath: rel, chunks: [], warnings: [], sawReal: false };
  }
  const chunks = [];
  const warnings = [];
  let sawReal = false;
  for (const line of text.split("\n")) {
    if (line === "")
      continue;
    const entry = parseJsonlLine(line);
    if (entry === null)
      continue;
    sawReal = true;
    const fp = entry.file;
    if (entry.type === "directory") {
      if (await isDirAbs(path4.join(cwd, fp))) {
        let cnt = 0;
        for (const mf of await listMdFiles(cwd, fp)) {
          if (cnt >= JSONL_DIR_MAXFILES)
            break;
          const absMf = path4.join(cwd, mf);
          if (!await isFileAbs(absMf))
            continue;
          let content = "";
          try {
            content = await readFile3(absMf, "utf8");
          } catch {
            content = "";
          }
          chunks.push({ path: mf, content });
          cnt++;
        }
      } else {
        warnings.push(`  > [WARN] directory not found\uFF08\u6CE8\u5165\u671F\u8DF3\u8FC7\uFF09: ${fp}`);
      }
    } else {
      if (await isFileAbs(path4.join(cwd, fp))) {
        let content = "";
        try {
          content = await readFile3(path4.join(cwd, fp), "utf8");
        } catch {
          content = "";
        }
        chunks.push({ path: fp, content });
      } else {
        warnings.push(`  > [WARN] file not found\uFF08\u6CE8\u5165\u671F\u8DF3\u8FC7\uFF09: ${fp}`);
      }
    }
  }
  return { kind: "ok", jsonlPath: rel, chunks, warnings, sawReal };
}

// packages/kernel/dist/state/session.js
function validateChangeName(name2) {
  if (name2 === void 0 || name2 === "") {
    return { ok: false, error: "ERROR: change-name \u4E0D\u80FD\u4E3A\u7A7A" };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name2)) {
    return { ok: false, error: `ERROR: change-name \u975E\u6CD5\u5B57\u7B26: '${name2}' (\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _)` };
  }
  return { ok: true };
}
function relatedFilesFromField(value) {
  if (value === void 0)
    return [];
  const parts = Array.isArray(value) ? value : value.trim() === "" || value.trim() === "null" ? [] : value.split(",");
  return parts.map((s) => s.trim()).filter((s) => s !== "");
}
var INDENT_OF = (line) => line.length - line.replace(/^ +/, "").length;
function parseProjectPackages(yamlText) {
  const lines = yamlText.split("\n");
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (INDENT_OF(line) !== 0)
      continue;
    const m = /^packages:\s*(.*)$/.exec(line);
    if (!m)
      continue;
    const inline = (m[1] ?? "").replace(/\s+#.*$/, "").trim();
    if (inline !== "")
      return null;
    break;
  }
  if (i >= lines.length)
    return null;
  const block = [];
  for (i++; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "" || line.trim().startsWith("#"))
      continue;
    if (INDENT_OF(line) === 0)
      break;
    block.push(line);
  }
  if (block.length === 0)
    return null;
  const entryIndent = INDENT_OF(block[0] ?? "");
  const decls = [];
  for (let j = 0; j < block.length; j++) {
    const line = block[j] ?? "";
    if (INDENT_OF(line) !== entryIndent)
      continue;
    const em = /^\s*([^:\s][^:]*):\s*(.*)$/.exec(line);
    if (!em)
      continue;
    const name2 = (em[1] ?? "").trim();
    const inline = (em[2] ?? "").replace(/\s+#.*$/, "").trim();
    if (inline !== "")
      continue;
    let pkgPath = name2;
    for (let k = j + 1; k < block.length; k++) {
      const child = block[k] ?? "";
      if (INDENT_OF(child) <= entryIndent)
        break;
      const pm = /^\s*path:\s*(.*)$/.exec(child);
      if (pm) {
        pkgPath = (pm[1] ?? "").replace(/\s+#.*$/, "").trim() || name2;
        break;
      }
    }
    decls.push({ name: name2, path: pkgPath });
  }
  return decls.length > 0 ? decls : null;
}
function normalizeRelPath(p) {
  let s = String(p).replace(/\\/g, "/");
  while (s.startsWith("./"))
    s = s.slice(2);
  while (s.length > 1 && s.endsWith("/"))
    s = s.slice(0, -1);
  return s;
}
function pathInSubtree(pathN, baseN) {
  if (pathN === baseN)
    return true;
  return pathN.startsWith(baseN + "/");
}
function packageForPath(filePath, packages) {
  if (packages === null)
    return null;
  const norm2 = normalizeRelPath(filePath);
  let bestName = null;
  let bestLen = -1;
  for (const pkg of packages) {
    const base = normalizeRelPath(pkg.path || pkg.name);
    if (base === "")
      continue;
    if (pathInSubtree(norm2, base) && base.length > bestLen) {
      bestName = pkg.name;
      bestLen = base.length;
    }
  }
  return bestName;
}
function routeContext(paths, packages) {
  const order = [];
  const map = /* @__PURE__ */ new Map();
  for (const p of paths) {
    const pkg = packageForPath(p, packages);
    let bucket = map.get(pkg);
    if (bucket === void 0) {
      bucket = [];
      map.set(pkg, bucket);
      order.push(pkg);
    }
    bucket.push(p);
  }
  return order.map((pkg) => ({ package: pkg, paths: map.get(pkg) ?? [] }));
}
function routeBucketsToObject(buckets) {
  const out = {};
  for (const b of buckets)
    out[b.package === null ? "null" : b.package] = b.paths;
  return out;
}
function renderRouteContextText(name2, obj) {
  const lines = [`[ROUTE-CONTEXT] ${name2} related_files \u6309 package \u5F52\u5C5E\uFF1A`];
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    lines.push("  (no related files / \u672A\u914D\u7F6E package \u2014 \u5168\u672A\u5F52\u5C5E)");
    return lines;
  }
  keys.sort((a, b) => {
    const na = a === "null" ? 1 : 0;
    const nb = b === "null" ? 1 : 0;
    if (na !== nb)
      return na - nb;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  for (const k of keys) {
    const label = k === "null" ? "(\u672A\u5F52\u5C5E)" : k;
    lines.push(`  [${label}]`);
    for (const p of obj[k] ?? [])
      lines.push(`    - ${p}`);
  }
  return lines;
}

// packages/kernel/dist/state/ownership.js
import { createHash } from "node:crypto";
import { mkdir as mkdir4, readFile as readFile4, readdir as readdir3, rm as rm2, rmdir, stat as stat5, unlink, writeFile as writeFile4 } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname as dirname3, join as join4 } from "node:path";
var OWNED_MANIFEST = ".pipeline-owned.json";
var VERSION_FILE = ".pipeline-version";
var WORKFLOW_DIR = ".pipeline";
var AGENTS_MD = "AGENTS.md";
var MANAGED_BLOCK_START = "<!-- PIPELINE:START -->";
var MANAGED_BLOCK_END = "<!-- PIPELINE:END -->";
var UNKNOWN_VERSION = "unknown";
var PLUGIN_KEY = "pipeline-workflow@pipeline-workflow";
var ALL_MANAGED_DIRS = [".pipeline", ".claude", ".codex", ".agents", ".agents/skills"];
var CODEX_UPGRADE_MARKERS = [
  ".agents/skills/pipeline-continue/SKILL.md",
  ".agents/skills/pipeline-finish-work/SKILL.md"
];
var NPM_TAG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
function computeContentHash(content) {
  const normalized = content.replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
function normalizeOwnedKey(rel) {
  if (!rel)
    return void 0;
  const posix2 = rel.replace(/\\/g, "/");
  if (posix2.startsWith("/"))
    return void 0;
  const out = [];
  for (const seg of posix2.split("/")) {
    if (seg === "" || seg === ".")
      continue;
    if (seg === "..") {
      if (out.length === 0)
        return void 0;
      out.pop();
      continue;
    }
    out.push(seg);
  }
  if (out.length === 0)
    return void 0;
  return out.join("/");
}
function parseOwnedManifest(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {};
  }
  if (Array.isArray(parsed)) {
    const out2 = {};
    for (const p of parsed)
      if (typeof p === "string" && p)
        out2[p] = "";
    return out2;
  }
  if (!parsed || typeof parsed !== "object")
    return {};
  const out = {};
  for (const [k, v] of Object.entries(parsed)) {
    out[k] = typeof v === "string" ? v : "";
  }
  return out;
}
function serializeOwnedManifest(map) {
  const sorted = {};
  for (const k of Object.keys(map).sort())
    sorted[k] = map[k] ?? "";
  return `${JSON.stringify(sorted, null, 2)}
`;
}
function recordOwned(map, rel, hash) {
  const key = normalizeOwnedKey(rel);
  if (key === void 0)
    return { ...map };
  return { ...map, [key]: hash };
}
function isOwnedModified(currentContent, storedHash) {
  if (currentContent === void 0)
    return false;
  if (!storedHash)
    return true;
  return computeContentHash(currentContent) !== storedHash;
}
function isManagedAgentsMd(content) {
  if (content === void 0)
    return false;
  return content.includes(MANAGED_BLOCK_START) && content.includes(MANAGED_BLOCK_END);
}
function shouldKeepAgentsMd(content) {
  if (content === void 0)
    return true;
  return isManagedAgentsMd(content);
}
function pruneOwnedManifest(map, opts) {
  const wf = opts.workflowDir ?? WORKFLOW_DIR;
  const known = /* @__PURE__ */ new Set();
  for (const k of opts.knownKeys ?? []) {
    const n = normalizeOwnedKey(k);
    if (n)
      known.add(n);
  }
  for (const m of opts.migrationPaths ?? []) {
    const n = normalizeOwnedKey(m);
    if (n)
      known.add(n);
  }
  const kept = {};
  const pruned = [];
  for (const [key, val] of Object.entries(map)) {
    if (key === wf || key.startsWith(`${wf}/`)) {
      kept[key] = val;
      continue;
    }
    if (key === AGENTS_MD) {
      if (shouldKeepAgentsMd(opts.agentsMdContent))
        kept[key] = val;
      else
        pruned.push(key);
      continue;
    }
    if (known.has(key))
      kept[key] = val;
    else
      pruned.push(key);
  }
  return { kept, pruned };
}
function structuredKindForKey(key) {
  switch (key) {
    case ".cursor/hooks.json":
    case ".github/copilot/hooks.json":
      return "flat";
    case ".opencode/package.json":
      return "opencode-package";
    case ".pi/settings.json":
      return "pi-settings";
    case ".codex/config.toml":
      return "codex-config";
  }
  if (key === "hooks.json" || key.endsWith("/hooks.json") || key === "settings.json" || key.endsWith("/settings.json")) {
    return "nested";
  }
  return null;
}
function commandMatchesDeletedPath(command, deletedPaths) {
  if (typeof command !== "string")
    return false;
  const trimmed = command.trim();
  if (!trimmed)
    return false;
  const tokens = trimmed.split(/\s+/);
  const last = (tokens[tokens.length - 1] ?? "").replace(/^["']+|["']+$/g, "");
  if (!last)
    return false;
  for (const p of deletedPaths) {
    if (!p)
      continue;
    if (last === p || last.endsWith(`/${p}`))
      return true;
  }
  return false;
}
function entryCommand(entry) {
  if (!entry || typeof entry !== "object")
    return void 0;
  const e = entry;
  for (const k of ["command", "bash", "powershell"]) {
    if (typeof e[k] === "string")
      return e[k];
  }
  return void 0;
}
function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function dumpJson(obj) {
  return `${JSON.stringify(obj, null, 2)}
`;
}
function scrubHooks(content, deletedPaths, mode) {
  let root;
  try {
    root = JSON.parse(content);
  } catch {
    return { content, fullyEmpty: false };
  }
  if (!isPlainObject(root))
    return { content, fullyEmpty: false };
  const hooksObj = root.hooks;
  if (hooksObj === void 0) {
    return { content: dumpJson(root), fullyEmpty: Object.keys(root).length === 0 };
  }
  if (!isPlainObject(hooksObj))
    return { content, fullyEmpty: false };
  for (const eventName of Object.keys(hooksObj)) {
    const arr = hooksObj[eventName];
    if (!Array.isArray(arr))
      continue;
    const filtered = [];
    for (const entry of arr) {
      if (mode === "nested") {
        const kept = scrubNestedMatcher(entry, deletedPaths);
        if (kept !== null)
          filtered.push(kept);
      } else {
        const cmd = entryCommand(entry);
        if (!(cmd !== void 0 && commandMatchesDeletedPath(cmd, deletedPaths)))
          filtered.push(entry);
      }
    }
    if (filtered.length === 0)
      delete hooksObj[eventName];
    else
      hooksObj[eventName] = filtered;
  }
  if (Object.keys(hooksObj).length === 0)
    delete root.hooks;
  return { content: dumpJson(root), fullyEmpty: Object.keys(root).length === 0 };
}
function scrubNestedMatcher(entry, deletedPaths) {
  if (!isPlainObject(entry))
    return entry;
  const inner = entry.hooks;
  if (!Array.isArray(inner))
    return entry;
  const filtered = inner.filter((sub) => {
    const cmd = entryCommand(sub);
    return !(cmd !== void 0 && commandMatchesDeletedPath(cmd, deletedPaths));
  });
  if (filtered.length === 0)
    return null;
  return { ...entry, hooks: filtered };
}
function scrubHooksNested(content, deletedPaths) {
  return scrubHooks(content, deletedPaths, "nested");
}
function scrubHooksFlat(content, deletedPaths) {
  return scrubHooks(content, deletedPaths, "flat");
}
function scrubStructured(kind, content, deletedPaths) {
  switch (kind) {
    case "nested":
      return scrubHooksNested(content, deletedPaths);
    case "flat":
      return scrubHooksFlat(content, deletedPaths);
    default:
      return { content, fullyEmpty: false };
  }
}
function isStubScrubKind(kind) {
  return kind !== "nested" && kind !== "flat";
}
function isManagedPath(dir) {
  const p = dir.replace(/\\/g, "/");
  return ALL_MANAGED_DIRS.some((d) => p === d || p.startsWith(`${d}/`));
}
function isManagedRootDir(dir) {
  const p = dir.replace(/\\/g, "/");
  return ALL_MANAGED_DIRS.includes(p);
}
function isUnknownVersion(v) {
  return v === UNKNOWN_VERSION;
}
function isNumericIdentifier(p) {
  if (!p || !/^[0-9]+$/.test(p))
    return false;
  return String(parseInt(p, 10)) === p;
}
function compareVersions(a, b) {
  const splitFirstHyphen = (v) => {
    const idx = v.indexOf("-");
    return idx === -1 ? [v, null] : [v.slice(0, idx), v.slice(idx + 1)];
  };
  const parseBase = (v) => v.split(".").map((n) => {
    const x = parseInt(n, 10);
    return Number.isNaN(x) ? 0 : x;
  });
  const [aBase, aPre] = splitFirstHyphen(a);
  const [bBase, bPre] = splitFirstHyphen(b);
  const ap = parseBase(aBase);
  const bp = parseBase(bBase);
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const av = ap[i] ?? 0;
    const bv = bp[i] ?? 0;
    if (av < bv)
      return -1;
    if (av > bv)
      return 1;
  }
  if (!aPre && bPre)
    return 1;
  if (aPre && !bPre)
    return -1;
  if (!aPre && !bPre)
    return 0;
  const aIds = aPre.split(".");
  const bIds = bPre.split(".");
  for (let i = 0; i < Math.max(aIds.length, bIds.length); i++) {
    if (i >= aIds.length)
      return -1;
    if (i >= bIds.length)
      return 1;
    const ai = aIds[i];
    const bi = bIds[i];
    const aNum = isNumericIdentifier(ai);
    const bNum = isNumericIdentifier(bi);
    if (aNum && !bNum)
      return -1;
    if (!aNum && bNum)
      return 1;
    if (aNum && bNum) {
      const an = parseInt(ai, 10);
      const bn = parseInt(bi, 10);
      if (an < bn)
        return -1;
      if (an > bn)
        return 1;
    } else {
      if (ai < bi)
        return -1;
      if (ai > bi)
        return 1;
    }
  }
  return 0;
}
function guardDowngrade(cliVersion, projectVersion, allowDowngrade) {
  const cmp = compareVersions(cliVersion, projectVersion);
  if (cmp < 0) {
    if (!allowDowngrade) {
      return {
        action: "reject",
        proceed: false,
        messages: [
          "Cannot sync: this would DOWNGRADE the project pipeline assets.",
          `  CLI version:     ${cliVersion}`,
          `  Project version: ${projectVersion}`,
          "Two ways forward:",
          "  1. Upgrade the plugin to match the project.",
          "  2. Pass --allow-downgrade to force the downgrade."
        ]
      };
    }
    return { action: "downgrade", proceed: true, messages: ["Proceeding with downgrade (--allow-downgrade)..."] };
  }
  return { action: "ok", proceed: true, messages: [] };
}
function shouldInjectConfigSections(cliVersion, projectVersion) {
  if (isUnknownVersion(projectVersion))
    return false;
  return compareVersions(cliVersion, projectVersion) > 0;
}
function migrateGateDecision(pendingCount, migrate, cliVersion, projectVersion, metadata) {
  const inWindow = pendingCount > 0 && !migrate && !isUnknownVersion(projectVersion) && compareVersions(cliVersion, projectVersion) > 0;
  if (!inWindow)
    return { decision: "ok", exitCode: 0, messages: [] };
  if (metadata.breaking && metadata.recommend_migrate) {
    return {
      decision: "required",
      exitCode: 1,
      messages: [
        "MIGRATION REQUIRED: this is a breaking upgrade with structural migrations.",
        "Re-run with --migrate to apply renames/deletions (a full backup is taken first).",
        "Refusing to proceed without --migrate would leave a half-migrated tree."
      ]
    };
  }
  return { decision: "tip", exitCode: 0, messages: ["Tip: Use --migrate to apply pending path migrations."] };
}
function needsCodexUpgrade(hasCodexDir, manifestKeys) {
  if (hasCodexDir)
    return false;
  const keys = new Set(manifestKeys.map((k) => k.replace(/\\/g, "/")));
  return CODEX_UPGRADE_MARKERS.some((m) => keys.has(m));
}
function bannerNudge(projectVersion, cliVersion) {
  if (isUnknownVersion(projectVersion))
    return null;
  const cmp = compareVersions(cliVersion, projectVersion);
  if (cmp > 0) {
    return {
      direction: "update",
      projectVersion,
      cliVersion,
      message: `pipeline assets are out of date: ${projectVersion} -> ${cliVersion}. Run: pipeline sync`
    };
  }
  if (cmp < 0) {
    return {
      direction: "upgrade",
      projectVersion,
      cliVersion,
      message: `Your pipeline plugin (${cliVersion}) is older than this project (${projectVersion}). Run: pipeline upgrade`
    };
  }
  return null;
}
function deriveUpgradeChannel(currentVersion, requestedTag) {
  if (requestedTag !== void 0) {
    if (!NPM_TAG_RE.test(requestedTag))
      throw new Error(`Invalid upgrade tag: ${JSON.stringify(requestedTag)}`);
    return requestedTag;
  }
  if (currentVersion.includes("-beta"))
    return "beta";
  if (currentVersion.includes("-rc"))
    return "rc";
  return "latest";
}
function getInstalledPluginVersion(installedJsonText, pluginKey = PLUGIN_KEY) {
  let data;
  try {
    data = JSON.parse(installedJsonText);
  } catch {
    return null;
  }
  if (!isPlainObject(data))
    return null;
  const plugins = data.plugins;
  if (!isPlainObject(plugins))
    return null;
  const entry = plugins[pluginKey];
  if (!Array.isArray(entry) || entry.length === 0)
    return null;
  const first = entry[0];
  if (!isPlainObject(first))
    return null;
  const version = first.version;
  return typeof version === "string" && version ? version : null;
}
function deriveChannelFromInstalled(installedJsonText, pluginKey = PLUGIN_KEY) {
  const version = getInstalledPluginVersion(installedJsonText, pluginKey);
  if (!version)
    return "latest";
  return deriveUpgradeChannel(version);
}
function ownedManifestPath(cwd) {
  return join4(cwd, OWNED_MANIFEST);
}
function readOwnedManifestText(fs, cwd) {
  return fs.readText(ownedManifestPath(cwd));
}
async function loadOwnedManifest(fs, cwd) {
  const text = await readOwnedManifestText(fs, cwd);
  return text === void 0 ? {} : parseOwnedManifest(text);
}
function saveOwnedManifest(fs, cwd, map) {
  return fs.writeText(ownedManifestPath(cwd), serializeOwnedManifest(map));
}
async function readVersionFile(fs, cwd) {
  const t = await fs.readText(join4(cwd, VERSION_FILE));
  if (t === void 0)
    return UNKNOWN_VERSION;
  return t.trim() || UNKNOWN_VERSION;
}
function createOwnedFs() {
  return {
    readText: async (abs) => {
      try {
        return await readFile4(abs, "utf8");
      } catch {
        return void 0;
      }
    },
    writeText: async (abs, content) => {
      await mkdir4(dirname3(abs), { recursive: true });
      await writeFile4(abs, content, "utf8");
    },
    exists: async (abs) => {
      try {
        await stat5(abs);
        return true;
      } catch {
        return false;
      }
    },
    isDir: async (abs) => {
      try {
        return (await stat5(abs)).isDirectory();
      } catch {
        return false;
      }
    },
    unlink: async (abs) => {
      try {
        await unlink(abs);
        return true;
      } catch {
        return false;
      }
    },
    rmrf: async (abs) => {
      await rm2(abs, { recursive: true, force: true }).catch(() => {
      });
    },
    rmdirEmpty: async (abs) => {
      try {
        await rmdir(abs);
        return true;
      } catch {
        return false;
      }
    },
    listDir: async (abs) => {
      try {
        return await readdir3(abs);
      } catch {
        return [];
      }
    },
    homeDir: () => homedir(),
    homedirBypass: () => process.env.PIPELINE_ALLOW_HOMEDIR === "1"
  };
}

// packages/kernel/dist/flow/manifest.js
import { readFileSync as readFileSync3 } from "node:fs";
var ManifestError = class extends Error {
  constructor(message) {
    super(`manifest: ${message}`);
    this.name = "ManifestError";
  }
};
var PHASE_SET = new Set(PHASES);
var SKILL_TRACK_SET = /* @__PURE__ */ new Set(["pm", "frontend", "backend", "_all"]);
var ROUTER_TRACK_SET = /* @__PURE__ */ new Set(["frontend", "backend", "pm"]);
function skillsFor(table, phase, track) {
  const row = table[phase];
  if (!row)
    return [];
  if (track in row)
    return row[track] ?? [];
  if ("_all" in row)
    return row._all ?? [];
  return [];
}
function bashSquote(s) {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}
function genRouterSh(patterns) {
  return [
    "# AUTO-GENERATED from manifest.yaml (kernel loadManifest) \u2014 \u4E0D\u8981\u624B\u6539",
    `FE_PATTERN=${bashSquote(patterns.frontend)}`,
    `BE_PATTERN=${bashSquote(patterns.backend)}`,
    `PM_PATTERN=${bashSquote(patterns.pm)}`
  ].join("\n");
}
function assertPhase(name2, ctx) {
  if (!PHASE_SET.has(name2)) {
    throw new ManifestError(`${ctx} \u542B\u672A\u77E5\u76F8\u4F4D '${name2}'\uFF08\u5408\u6CD5\uFF1A${PHASES.join("/")}\uFF09`);
  }
  return name2;
}
function stripComment(line) {
  const t = line.trimStart();
  if (t.startsWith("#"))
    return "";
  const m = line.match(/^(.*?)\s#/);
  return (m ? m[1] : line).trimEnd();
}
function indentOf(line) {
  let n = 0;
  while (n < line.length && line[n] === " ")
    n++;
  return n;
}
function parseFlowList(raw, ctx) {
  const s = raw.trim();
  const m = s.match(/^\[(.*)\]$/);
  if (!m)
    throw new ManifestError(`${ctx} \u671F\u671B\u5355\u884C\u6D41\u5F0F\u5217\u8868 [a, b]\uFF0C\u5F97\u5230 '${raw}'`);
  const inner = m[1].trim();
  if (inner === "")
    return [];
  return inner.split(",").map((x) => x.trim()).filter((x) => x !== "");
}
function parseScalarValue(rest, ctx) {
  const s = rest.trim();
  if (s.startsWith("'")) {
    const end = s.indexOf("'", 1);
    if (end < 0)
      throw new ManifestError(`${ctx} \u5355\u5F15\u53F7\u672A\u95ED\u5408: '${rest}'`);
    return s.slice(1, end);
  }
  if (s.startsWith('"')) {
    const end = s.indexOf('"', 1);
    if (end < 0)
      throw new ManifestError(`${ctx} \u53CC\u5F15\u53F7\u672A\u95ED\u5408: '${rest}'`);
    return s.slice(1, end);
  }
  const m = s.match(/^(.*?)\s#/);
  return (m ? m[1] : s).trimEnd();
}
function parseSkillBlock(lines, start, path6, section) {
  const map = /* @__PURE__ */ new Map();
  let i = start;
  while (i < lines.length) {
    const l = stripComment(lines[i]);
    if (l.trim() === "") {
      i++;
      continue;
    }
    if (!/^\s/.test(l))
      break;
    const entry = l.match(/^\s+([A-Za-z_][A-Za-z0-9_.-]*):\s*(\[.*\])\s*$/);
    if (!entry) {
      throw new ManifestError(`${path6}:${i + 1} ${section} \u6761\u76EE\u987B\u4E3A 'phase.track: [skill, ...]'\uFF0C\u5F97\u5230 '${lines[i]}'`);
    }
    map.set(entry[1], parseFlowList(entry[2], `${section}.${entry[1]}`));
    i++;
  }
  return { map, next: i };
}
function parseScalarBlock(lines, start, path6, section) {
  const map = /* @__PURE__ */ new Map();
  let i = start;
  while (i < lines.length) {
    const raw = lines[i];
    if (raw.trim() === "") {
      i++;
      continue;
    }
    if (raw.trimStart().startsWith("#")) {
      i++;
      continue;
    }
    if (!/^\s/.test(raw))
      break;
    const entry = raw.match(/^\s+([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!entry) {
      throw new ManifestError(`${path6}:${i + 1} ${section} \u6761\u76EE\u987B\u4E3A 'key: value'\uFF0C\u5F97\u5230 '${lines[i]}'`);
    }
    map.set(entry[1], parseScalarValue(entry[2], `${section}.${entry[1]}`));
    i++;
  }
  return { map, next: i };
}
function parseBreadcrumbBlock(lines, start, path6) {
  const map = /* @__PURE__ */ new Map();
  let i = start;
  while (i < lines.length) {
    const raw = lines[i];
    if (raw.trim() === "") {
      i++;
      continue;
    }
    const ind = indentOf(raw);
    if (ind === 0)
      break;
    if (raw.trimStart().startsWith("#")) {
      i++;
      continue;
    }
    const entry = raw.match(/^(\s+)([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!entry) {
      throw new ManifestError(`${path6}:${i + 1} breadcrumb \u6761\u76EE\u987B\u4E3A 'phase: |' \u6216 'phase: value'\uFF0C\u5F97\u5230 '${lines[i]}'`);
    }
    const keyIndent = entry[1].length;
    const key = entry[2];
    const rest = entry[3].trim();
    i++;
    if (rest === "|" || rest === "|-" || rest === "|+") {
      const blk = [];
      while (i < lines.length) {
        const bl = lines[i];
        if (bl.trim() === "") {
          blk.push("");
          i++;
          continue;
        }
        if (indentOf(bl) <= keyIndent)
          break;
        blk.push(bl);
        i++;
      }
      const firstContent = blk.find((x) => x !== "");
      let value = "";
      if (firstContent !== void 0) {
        const blockIndent = indentOf(firstContent);
        value = blk.map((x) => x === "" ? "" : x.slice(blockIndent)).join("\n").replace(/\n+$/, "");
      }
      map.set(key, value);
    } else {
      map.set(key, parseScalarValue(rest, `breadcrumb.${key}`));
    }
  }
  return { map, next: i };
}
function scanSections(text, path6) {
  const lines = text.split("\n");
  const out = {};
  let i = 0;
  while (i < lines.length) {
    const line = stripComment(lines[i]);
    if (line.trim() === "") {
      i++;
      continue;
    }
    const top = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!top) {
      throw new ManifestError(`${path6}:${i + 1} \u65E0\u6CD5\u89E3\u6790\u7684\u9876\u5C42\u884C '${lines[i]}'\uFF08\u7A84\u89E3\u6790\u5B50\u96C6\u5916\uFF09`);
    }
    const key = top[1];
    const rest = top[2].trim();
    if (key === "phases" || key === "review_phases") {
      const items = [];
      if (rest !== "") {
        items.push(...parseFlowList(rest, key));
        i++;
      } else {
        i++;
        while (i < lines.length) {
          const l = stripComment(lines[i]);
          if (l.trim() === "") {
            i++;
            continue;
          }
          const item = l.match(/^\s+-\s+(\S+)\s*$/);
          if (!item)
            break;
          items.push(item[1]);
          i++;
        }
      }
      if (key === "phases")
        out.phases = items;
      else
        out.review_phases = items;
    } else if (key === "transitions") {
      if (rest !== "")
        throw new ManifestError(`${path6}:${i + 1} transitions \u5FC5\u987B\u662F\u5757\u5C0F\u8282`);
      const map = /* @__PURE__ */ new Map();
      i++;
      while (i < lines.length) {
        const l = stripComment(lines[i]);
        if (l.trim() === "") {
          i++;
          continue;
        }
        if (!/^\s/.test(l))
          break;
        const entry = l.match(/^\s+([A-Za-z_][A-Za-z0-9_-]*):\s*(\[.*\])\s*$/);
        if (!entry) {
          throw new ManifestError(`${path6}:${i + 1} transitions \u6761\u76EE\u987B\u4E3A 'from: [to, ...]'\uFF0C\u5F97\u5230 '${lines[i]}'`);
        }
        map.set(entry[1], parseFlowList(entry[2], `transitions.${entry[1]}`));
        i++;
      }
      out.transitions = map;
    } else if (key === "mandatory_skills" || key === "recommended_skills") {
      if (rest !== "")
        throw new ManifestError(`${path6}:${i + 1} ${key} \u5FC5\u987B\u662F\u5757\u5C0F\u8282`);
      const r = parseSkillBlock(lines, i + 1, path6, key);
      if (key === "mandatory_skills")
        out.mandatory_skills = r.map;
      else
        out.recommended_skills = r.map;
      i = r.next;
    } else if (key === "router_patterns") {
      if (rest !== "")
        throw new ManifestError(`${path6}:${i + 1} router_patterns \u5FC5\u987B\u662F\u5757\u5C0F\u8282`);
      const r = parseScalarBlock(lines, i + 1, path6, "router_patterns");
      out.router_patterns = r.map;
      i = r.next;
    } else if (key === "breadcrumb") {
      if (rest !== "")
        throw new ManifestError(`${path6}:${i + 1} breadcrumb \u5FC5\u987B\u662F\u5757\u5C0F\u8282`);
      const r = parseBreadcrumbBlock(lines, i + 1, path6);
      out.breadcrumb = r.map;
      i = r.next;
    } else {
      i++;
      while (i < lines.length) {
        const l = lines[i];
        const stripped = stripComment(l);
        if (stripped.trim() !== "" && !/^\s/.test(stripped))
          break;
        i++;
      }
    }
  }
  return out;
}
function emptySkillTable() {
  const t = {};
  for (const p of PHASES)
    t[p] = {};
  return t;
}
function deriveSkillTable(raw, declared, section) {
  const table = emptySkillTable();
  if (!raw)
    return table;
  for (const [pt, list] of raw) {
    const dot = pt.indexOf(".");
    if (dot <= 0 || dot === pt.length - 1) {
      throw new ManifestError(`${section} \u952E '${pt}' \u987B\u4E3A 'phase.track' \u5F62\u5F0F`);
    }
    const phaseName = pt.slice(0, dot);
    const track = pt.slice(dot + 1);
    const phase = assertPhase(phaseName, section);
    if (!declared.has(phase))
      throw new ManifestError(`${section}.${pt} \u76F8\u4F4D '${phaseName}' \u672A\u5728 phases \u58F0\u660E`);
    if (!SKILL_TRACK_SET.has(track)) {
      throw new ManifestError(`${section}.${pt} \u542B\u672A\u77E5 track '${track}'\uFF08\u5408\u6CD5\uFF1Apm/frontend/backend/_all\uFF09`);
    }
    table[phase][track] = list;
  }
  return table;
}
function loadManifest(path6) {
  const text = readFileSync3(path6, "utf8");
  const raw = scanSections(text, path6);
  if (!raw.phases || raw.phases.length === 0)
    throw new ManifestError(`${path6} \u7F3A phases \u5C0F\u8282`);
  if (!raw.transitions)
    throw new ManifestError(`${path6} \u7F3A transitions \u5C0F\u8282`);
  if (!raw.review_phases) {
    throw new ManifestError(`${path6} \u7F3A review_phases \u952E\uFF08review-gate \u540D\u5355\u4E0D\u8BB8\u9759\u9ED8\u7F3A\u5931\uFF09`);
  }
  const phases = raw.phases.map((p) => assertPhase(p, "phases"));
  const declared = new Set(phases);
  if (declared.size !== phases.length)
    throw new ManifestError("phases \u542B\u91CD\u590D\u76F8\u4F4D");
  const transitions = {};
  for (const p of PHASES)
    transitions[p] = [];
  for (const [from, targets2] of raw.transitions) {
    const fromPh = assertPhase(from, "transitions");
    if (!declared.has(fromPh))
      throw new ManifestError(`transitions.${from} \u4E0D\u5728\u5DF2\u58F0\u660E phases \u4E2D`);
    transitions[fromPh] = targets2.map((t) => {
      const toPh = assertPhase(t, `transitions.${from}`);
      if (!declared.has(toPh))
        throw new ManifestError(`transitions.${from} \u6307\u5411\u672A\u58F0\u660E\u76F8\u4F4D '${t}'`);
      return toPh;
    });
  }
  for (const p of phases) {
    if (!raw.transitions.has(p)) {
      throw new ManifestError(`transitions \u7F3A\u76F8\u4F4D '${p}' \u7684\u6761\u76EE\uFF08\u7EC8\u6001\u4E5F\u987B\u663E\u5F0F\u58F0\u660E\uFF0C\u53EF\u4E3A []\uFF09`);
    }
  }
  const reviewPhases = raw.review_phases.map((p) => {
    const ph = assertPhase(p, "review_phases");
    if (!declared.has(ph))
      throw new ManifestError(`review_phases \u542B\u672A\u58F0\u660E\u76F8\u4F4D '${p}'`);
    return ph;
  });
  const mandatorySkills = deriveSkillTable(raw.mandatory_skills, declared, "mandatory_skills");
  const recommendedSkills = deriveSkillTable(raw.recommended_skills, declared, "recommended_skills");
  const routerPatterns = { frontend: "", backend: "", pm: "" };
  if (raw.router_patterns) {
    for (const [track, pat] of raw.router_patterns) {
      if (!ROUTER_TRACK_SET.has(track)) {
        throw new ManifestError(`router_patterns \u542B\u672A\u77E5 track '${track}'\uFF08\u5408\u6CD5\uFF1Afrontend/backend/pm\uFF09`);
      }
      routerPatterns[track] = pat;
    }
  }
  const breadcrumbs = {};
  if (raw.breadcrumb) {
    for (const [phaseName, prose] of raw.breadcrumb) {
      const ph = assertPhase(phaseName, "breadcrumb");
      if (!declared.has(ph))
        throw new ManifestError(`breadcrumb \u542B\u672A\u58F0\u660E\u76F8\u4F4D '${phaseName}'`);
      breadcrumbs[ph] = prose;
    }
  }
  return { phases, transitions, reviewPhases, mandatorySkills, recommendedSkills, routerPatterns, breadcrumbs };
}

// packages/kernel/dist/flow/guard.js
var EXIT_RULES = {
  // open 出口（manifest.yaml:146-151）
  open: [
    { kind: "statefile" },
    { kind: "file-nonempty", path: "proposal.md" },
    { kind: "file-exists", path: "tasks.md" },
    { kind: "tasks-at-least", n: 1 },
    { kind: "file-nonempty", path: "design.md", tracks: ["backend", "frontend"] }
  ],
  // explore 出口（manifest.yaml:171-174）
  explore: [
    { kind: "statefile" },
    { kind: "nonempty", field: "design_doc" },
    { kind: "field-file-exists", field: "design_doc" }
  ],
  // spec 出口（manifest.yaml:188-192 + guard.sh:510-528 coverage 显式步）
  spec: [
    { kind: "statefile" },
    { kind: "nonempty", field: "plan", tracks: ["backend", "frontend"] },
    { kind: "field-file-exists", field: "plan", tracks: ["backend", "frontend"] },
    { kind: "tasks-at-least", n: 3 },
    { kind: "coverage" }
  ],
  // build 出口（guard.sh:154-162 前置闸 + manifest.yaml:218-222 + guard.sh:532-559 显式步）
  build: [
    { kind: "automation-queued" },
    { kind: "statefile" },
    { kind: "tasks-all-done" },
    { kind: "nonempty", field: "build_mode" },
    { kind: "nonempty", field: "isolation" },
    { kind: "full-direct-override" },
    { kind: "depends-archived" }
  ],
  // verify 出口（manifest.yaml:239-247；verify_result 仅 pm——fe/be 由 verify-pass 事件体落值）
  verify: [
    { kind: "statefile" },
    { kind: "nonempty", field: "verification_report" },
    { kind: "field-file-exists", field: "verification_report", desc: "verification_report \u6587\u4EF6\u5B58\u5728" },
    { kind: "eq", field: "branch_status", value: "handled" },
    { kind: "eq", field: "agent_review_result", value: "pass", tracks: ["frontend", "backend"] },
    { kind: "eq", field: "codex_review_result", value: "pass", tracks: ["frontend", "backend"] },
    { kind: "eq", field: "verify_result", value: "pass", tracks: ["pm"] }
  ],
  // ship 出口（manifest.yaml:259-263）
  ship: [
    { kind: "statefile" },
    { kind: "nonempty", field: "prd_path", tracks: ["pm"] },
    { kind: "field-file-exists", field: "prd_path", desc: "prd_path \u6587\u4EF6\u5B58\u5728", tracks: ["pm"] },
    { kind: "nonempty", field: "pr_url", tracks: ["frontend", "backend"] }
  ],
  // archive 出口（manifest.yaml:272-274）
  archive: [
    { kind: "statefile" },
    { kind: "eq", field: "verify_result", value: "pass" }
  ]
};
var COVERAGE_LAYERS = [
  "L1_api",
  "L2_data",
  "L3_rules",
  "L4_state",
  "L5_errors",
  "L6_security",
  "L7_perf",
  "L8_deps",
  "L10_terms"
];
var COVERAGE_APPLICABILITY = {
  backend: {
    L1_api: "required",
    L2_data: "required",
    L3_rules: "required",
    L4_state: "required",
    L5_errors: "required",
    L6_security: "required",
    L8_deps: "required",
    L7_perf: "optional",
    L10_terms: "optional"
  },
  frontend: {
    L4_state: "required",
    L5_errors: "required",
    L1_api: "optional",
    L3_rules: "optional",
    L6_security: "optional",
    L7_perf: "optional",
    L8_deps: "optional",
    L10_terms: "optional"
  },
  pm: {
    L3_rules: "required",
    L2_data: "optional",
    L4_state: "optional",
    L10_terms: "optional"
  }
};
var COVERAGE_LOCK_CONCERN = { L6_security: "auth" };
function coverageBlockLines(content) {
  if (content === void 0)
    return [];
  const out = [];
  let inBlock = false;
  for (const line of content.split("\n")) {
    if (/^```coverage/.test(line)) {
      inBlock = true;
      continue;
    }
    if (/^```/.test(line)) {
      inBlock = false;
      continue;
    }
    if (inBlock)
      out.push(line);
  }
  return out;
}
function coverageBlockStatus(lines, layer) {
  const row = lines.find((l) => l.startsWith(`${layer}:`));
  if (row === void 0)
    return "blank";
  const m = /^[ \t]*([a-zA-Z]+)/.exec(row.slice(layer.length + 1));
  const st = m?.[1];
  return st === "filled" || st === "waived" ? st : "blank";
}
function coverageTouches(lines) {
  const row = lines.find((l) => l.startsWith("touches:"));
  if (row === void 0)
    return [];
  return row.slice("touches:".length).split(/[,\s]+/).filter((w) => w !== "");
}
function isEmpty(v) {
  if (v === void 0)
    return true;
  if (Array.isArray(v))
    return v.length === 0;
  return v === "" || v === "null";
}
function scalar(v) {
  return typeof v === "string" ? v : Array.isArray(v) ? v.join(",") : "";
}
function depsOf(v) {
  const items = Array.isArray(v) ? v : (v ?? "").split(",");
  return items.map((s) => s.trim()).filter((s) => s !== "" && s !== "null");
}
function taskCount(content) {
  if (content === void 0)
    return 0;
  return content.split("\n").filter((l) => /^- \[[ x]\]/.test(l)).length;
}
function trackApplies(tracks, track) {
  return tracks === void 0 || tracks.includes(track);
}
function trackSuffix(tracks, track) {
  return tracks === void 0 ? "" : ` (${track} track)`;
}
function evaluateCoverage(state, ctx, failures, warnings) {
  if (ctx.readFile === void 0)
    return;
  const track = scalar(state.fields.track);
  const preset = scalar(state.fields.preset);
  const dd = scalar(state.fields.design_doc);
  const content = dd !== "" && dd !== "null" ? ctx.readFile(dd) : void 0;
  const lines = coverageBlockLines(content);
  const touches = coverageTouches(lines);
  const applicability = COVERAGE_APPLICABILITY[track];
  const blockedLines = [];
  let lockViolations = 0;
  for (const layer of COVERAGE_LAYERS) {
    const app = applicability?.[layer] ?? "na";
    if (app === "na")
      continue;
    const status = coverageBlockStatus(lines, layer);
    const concern = COVERAGE_LOCK_CONCERN[layer];
    const locked = concern !== void 0 && touches.includes(concern);
    if (locked) {
      if (status !== "filled") {
        blockedLines.push(`${layer} ${app} ${status} BLOCKED LOCKVIOLATION`);
        lockViolations += 1;
      }
    } else if (app === "required" && status === "blank") {
      blockedLines.push(`${layer} ${app} ${status} BLOCKED`);
    }
  }
  const waive = preset === "hotfix" || preset === "tweak";
  const covBlock = waive ? lockViolations : blockedLines.length;
  if (waive) {
    const warnBlank = blockedLines.length - lockViolations;
    if (warnBlank > 0) {
      warnings.push(`${preset}\uFF1A${warnBlank} \u5C42\u8986\u76D6\u7559\u7A7A\uFF08\u5DF2\u8C41\u514D\uFF0C\u5EFA\u8BAE\u8865\uFF1B\u{1F512} \u9501\u4E0D\u8C41\u514D\uFF09`);
    }
  }
  if (covBlock > 0) {
    failures.push(`spec \u51FA\u53E3\uFF1A\u5168\u6808 Spec \u8986\u76D6\uFF08${covBlock} \u5C42\u963B\u585E\uFF09`);
    for (const l of blockedLines)
      warnings.push(`\u8986\u76D6\u963B\u585E: ${l}`);
  }
}
function evaluateGuard(state, ctx) {
  const phase = scalar(state.fields.phase);
  const rules = EXIT_RULES[phase];
  if (!rules) {
    return { pass: false, failures: [`\u672A\u77E5 phase '${phase}'\uFF0C\u65E0\u6CD5\u8BC4\u4F30\u51FA\u53E3\u6761\u4EF6`] };
  }
  const track = scalar(state.fields.track);
  const changeDir2 = ctx?.changeDirRel;
  const failures = [];
  const warnings = [];
  for (const rule of rules) {
    switch (rule.kind) {
      case "nonempty": {
        if (!trackApplies(rule.tracks, track))
          break;
        const value = state.fields[rule.field];
        if (isEmpty(value)) {
          failures.push(`${phase} \u51FA\u53E3\uFF1A\u8981\u6C42 ${rule.field} \u975E\u7A7A\uFF08\u5F53\u524D='${scalar(value)}'\uFF09`);
        }
        break;
      }
      case "eq": {
        if (!trackApplies(rule.tracks, track))
          break;
        const value = state.fields[rule.field];
        if (scalar(value) !== rule.value) {
          failures.push(`${phase} \u51FA\u53E3\uFF1A\u8981\u6C42 ${rule.field}=${rule.value}\uFF08\u5F53\u524D='${scalar(value)}'\uFF09`);
        }
        break;
      }
      case "automation-queued": {
        if (ctx?.automationRunner === true)
          break;
        if (scalar(state.fields.automation) === "queued") {
          failures.push(`${phase} \u51FA\u53E3\uFF1Aautomation=queued \u5DF2\u5165\u961F\u8C03\u5EA6\u5668\uFF0C\u4E3B\u7EBF build \u8DEF\u5F84\u88AB\u62E6\uFF08\u60F3\u624B\u52A8\u8DD1\u5148 set automation off\uFF09`);
        }
        break;
      }
      case "full-direct-override": {
        if (scalar(state.fields.preset) === "full" && scalar(state.fields.build_mode) === "direct") {
          const ovr = scalar(state.fields.direct_override);
          if (ovr !== "true") {
            failures.push(`${phase} \u51FA\u53E3\uFF1Afull+direct \u8981\u6C42 direct_override=true\uFF08\u5F53\u524D='${ovr}'\uFF09`);
          }
        }
        break;
      }
      case "statefile": {
        if (ctx?.fileNonempty === void 0 || changeDir2 === void 0)
          break;
        if (!ctx.fileNonempty(`${changeDir2}/.pipeline.yaml`)) {
          failures.push(`${phase} \u51FA\u53E3\uFF1A\u8981\u6C42 \u72B6\u6001\u6587\u4EF6\u5B58\u5728\u4E14\u975E\u7A7A\uFF08.pipeline.yaml\uFF09`);
        }
        break;
      }
      case "file-nonempty": {
        if (!trackApplies(rule.tracks, track))
          break;
        if (ctx?.fileNonempty === void 0 || changeDir2 === void 0)
          break;
        if (!ctx.fileNonempty(`${changeDir2}/${rule.path}`)) {
          failures.push(`${phase} \u51FA\u53E3\uFF1A\u8981\u6C42 ${rule.path} \u5B58\u5728\u4E14\u975E\u7A7A${trackSuffix(rule.tracks, track)}`);
        }
        break;
      }
      case "file-exists": {
        if (ctx?.fileExists === void 0 || changeDir2 === void 0)
          break;
        if (!ctx.fileExists(`${changeDir2}/${rule.path}`)) {
          failures.push(`${phase} \u51FA\u53E3\uFF1A\u8981\u6C42 ${rule.path} \u5B58\u5728`);
        }
        break;
      }
      case "tasks-at-least": {
        if (ctx?.readFile === void 0 || changeDir2 === void 0)
          break;
        const count = taskCount(ctx.readFile(`${changeDir2}/tasks.md`));
        if (count < rule.n) {
          failures.push(`${phase} \u51FA\u53E3\uFF1A\u8981\u6C42 tasks.md \u81F3\u5C11 ${rule.n} \u4E2A\u4EFB\u52A1\uFF08\u5F53\u524D=${count}\uFF09`);
        }
        break;
      }
      case "tasks-all-done": {
        if (ctx?.readFile === void 0 || changeDir2 === void 0)
          break;
        const content = ctx.readFile(`${changeDir2}/tasks.md`);
        if (content === void 0) {
          failures.push(`${phase} \u51FA\u53E3\uFF1A\u8981\u6C42 tasks.md \u5168\u90E8\u52FE\u9009\uFF08tasks.md \u7F3A\u5931\uFF09`);
        } else {
          const open = content.split("\n").filter((l) => /^- \[ \]/.test(l)).length;
          if (open > 0) {
            failures.push(`${phase} \u51FA\u53E3\uFF1A\u8981\u6C42 tasks.md \u5168\u90E8\u52FE\u9009\uFF08\u4ECD\u6709 ${open} \u9879\u672A\u52FE\uFF09`);
          }
        }
        break;
      }
      case "field-file-exists": {
        if (!trackApplies(rule.tracks, track))
          break;
        if (ctx?.fileExists === void 0)
          break;
        const v = scalar(state.fields[rule.field]);
        if (v === "" || v === "null" || !ctx.fileExists(v)) {
          const label = rule.desc ?? `${rule.field} \u6307\u5411\u7684\u6587\u4EF6\u5B58\u5728`;
          failures.push(`${phase} \u51FA\u53E3\uFF1A\u8981\u6C42 ${label}${trackSuffix(rule.tracks, track)}\uFF08\u5F53\u524D='${v}'\uFF09`);
        }
        break;
      }
      case "coverage": {
        if (ctx !== void 0)
          evaluateCoverage(state, ctx, failures, warnings);
        break;
      }
      case "depends-archived": {
        if (ctx?.dirExists === void 0 || ctx.changeArchived === void 0)
          break;
        for (const dep of depsOf(state.fields.depends_on)) {
          if (ctx.dirExists(`openspec/changes/${dep}`)) {
            failures.push(`${phase} \u51FA\u53E3\uFF1A\u4F9D\u8D56 change '${dep}' \u5FC5\u987B\u5148\u5F52\u6863\uFF08\u5F53\u524D\u6D3B\u8DC3\uFF09`);
          } else if (!ctx.changeArchived(dep)) {
            failures.push(`${phase} \u51FA\u53E3\uFF1A\u4F9D\u8D56 change '${dep}' \u4E0D\u5B58\u5728\uFF08\u65E2\u4E0D\u5728\u6D3B\u8DC3\u4E5F\u4E0D\u5728\u5F52\u6863\uFF09`);
          }
        }
        break;
      }
    }
  }
  const result = { pass: failures.length === 0, failures };
  if (warnings.length > 0)
    result.warnings = warnings;
  return result;
}

// packages/kernel/dist/flow/engine.js
function defaultClock2() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
}
function createFlowEngine(manifest) {
  const phaseIndex = new Map(manifest.phases.map((p, i) => [p, i]));
  const reviewSet = new Set(manifest.reviewPhases);
  function legalTransitions(phase) {
    return manifest.transitions[phase] ?? [];
  }
  function transition(state, to, clock) {
    const rawFrom = state.fields.phase;
    const from = typeof rawFrom === "string" ? rawFrom : "";
    if (!phaseIndex.has(from) || !legalTransitions(from).includes(to)) {
      throw new IllegalTransitionError(from, to);
    }
    let phaseStatus = "pending";
    if (from === to)
      phaseStatus = "done";
    else if ((phaseIndex.get(to) ?? -1) < (phaseIndex.get(from) ?? -1))
      phaseStatus = "in_progress";
    const fields = { ...state.fields };
    fields.phase = to;
    fields.phase_status = phaseStatus;
    fields.updated_at = (clock ?? defaultClock2)();
    return { from, to, state: { fields, opaqueTail: state.opaqueTail } };
  }
  function guardCheck(state, ctx) {
    return evaluateGuard(state, ctx);
  }
  function isReviewPhase2(phase) {
    return reviewSet.has(phase);
  }
  return { manifest, legalTransitions, transition, guardCheck, isReviewPhase: isReviewPhase2 };
}

// packages/kernel/dist/flow/transition-table.js
var TRANSITION_EVENTS = {
  "open-complete": { from: "open", to: "explore" },
  "explore-complete": { from: "explore", to: "spec" },
  "spec-complete": { from: "spec", to: "build" },
  "build-complete": { from: "build", to: "verify" },
  "verify-pass": { from: "verify", to: "ship" },
  "verify-fail": { from: "verify", to: "build" },
  "ship-complete": { from: "ship", to: "archive" },
  archived: { from: "archive", to: "archive" }
};
function eventEdge(event) {
  return Object.prototype.hasOwnProperty.call(TRANSITION_EVENTS, event) ? TRANSITION_EVENTS[event] : void 0;
}
function fstr(state, k) {
  const v = state.fields[k];
  return Array.isArray(v) ? v.join(",") : v ?? "";
}
function isUnset(v) {
  return v === "" || v === "null";
}
async function checkTransitionPreconditions(event, state, ctx) {
  const f = (k) => fstr(state, k);
  const fileExists = (p) => ctx?.fileExists ? ctx.fileExists(p) : true;
  switch (event) {
    case "explore-complete": {
      const dd = f("design_doc");
      if (isUnset(dd) || !fileExists(dd)) {
        return [`ERROR: explore-complete \u8981\u6C42 design_doc \u5B57\u6BB5\u975E\u7A7A\u4E14\u6587\u4EF6\u5B58\u5728 (\u5F53\u524D=${dd})`];
      }
      break;
    }
    case "spec-complete": {
      const tr = f("track");
      if (tr !== "pm") {
        const pl = f("plan");
        if (isUnset(pl) || !fileExists(pl)) {
          return [`ERROR: ${tr} track spec-complete \u8981\u6C42 plan \u5B57\u6BB5\u975E\u7A7A\u4E14\u6587\u4EF6\u5B58\u5728 (\u5F53\u524D=${pl})`];
        }
      }
      break;
    }
    case "build-complete": {
      const bm = f("build_mode");
      const iso = f("isolation");
      if (isUnset(bm))
        return ["ERROR: build_mode \u5FC5\u987B\u8BBE\u7F6E"];
      if (isUnset(iso))
        return ["ERROR: isolation \u5FC5\u987B\u8BBE\u7F6E"];
      if (iso !== "branch" && iso !== "worktree") {
        return [`ERROR: \u975E\u6CD5\u503C '${iso}'\uFF0C\u5141\u8BB8: branch worktree`];
      }
      if (f("preset") === "full" && bm === "direct" && f("direct_override") !== "true") {
        return ["ERROR: full workflow \u4F7F\u7528 build_mode=direct \u5FC5\u987B\u663E\u5F0F\u8BBE direct_override=true"];
      }
      break;
    }
    case "verify-pass": {
      const vr = f("verification_report");
      if (isUnset(vr) || !fileExists(vr)) {
        return [`ERROR: verify-pass \u8981\u6C42 verification_report \u5B57\u6BB5\u975E\u7A7A\u4E14\u6587\u4EF6\u5B58\u5728 (\u5F53\u524D=${vr})`];
      }
      const bs = f("branch_status");
      if (bs !== "handled") {
        return [`ERROR: verify-pass \u8981\u6C42 branch_status=handled (\u5F53\u524D=${bs})`];
      }
      const tr = f("track");
      if (tr !== "pm") {
        const ar = f("agent_review_result");
        if (ar !== "pass")
          return [`ERROR: ${tr} track \u8981\u6C42 agent_review_result=pass (\u5F53\u524D=${ar})`];
        const cr = f("codex_review_result");
        if (cr !== "pass")
          return [`ERROR: ${tr} track \u8981\u6C42 codex_review_result=pass (\u5F53\u524D=${cr})`];
      }
      const bsha = f("build_sha");
      const head = (await ctx?.gitHeadSha?.())?.trim() ?? "";
      if (bsha !== "" && bsha !== "null" && head !== "" && bsha !== head) {
        return [
          `ERROR: verify-pass \u8981\u6C42 HEAD==build_sha\uFF08build \u540E\u4EA7\u7269\u88AB\u6539\u672A\u590D\u9A8C\uFF09build_sha=${bsha} HEAD=${head}`,
          "  \u4FEE\u590D\uFF1A\u8981\u4E48\u628A\u6539\u52A8\u5E76\u5165\u590D\u9A8C\uFF08\u91CD\u8DD1 build\u2192verify\uFF09\uFF0C\u8981\u4E48 verify-fail \u56DE\u9000\u540E\u91CD\u65B0 build-complete \u51BB\u7ED3\u65B0 SHA"
        ];
      }
      break;
    }
    default:
      break;
  }
  return null;
}
async function applyTransitionEffects(event, state, clock, ctx) {
  switch (event) {
    case "build-complete": {
      const sha = (await ctx?.gitHeadSha?.())?.trim() ?? "";
      if (sha) {
        state.fields.build_sha = sha;
        return { buildShaMissing: false };
      }
      return { buildShaMissing: true };
    }
    case "verify-pass":
      state.fields.verify_result = "pass";
      state.fields.verified_at = clock();
      return { buildShaMissing: false };
    case "verify-fail":
      state.fields.verify_result = "fail";
      state.fields.build_sha = "null";
      return { buildShaMissing: false };
    case "archived":
      state.fields.archived = "true";
      state.fields.archived_at = clock();
      return { buildShaMissing: false };
    default:
      return { buildShaMissing: false };
  }
}

// packages/kernel/dist/mem/fs.js
import { existsSync as existsSync2, readdirSync, readFileSync as readFileSync4, statSync } from "node:fs";
import { homedir as homedir2 } from "node:os";
function nodeMemFs(homeOverride) {
  const home = homeOverride ?? homedir2();
  return {
    home,
    exists: (p) => existsSync2(p),
    readDir: (p) => {
      try {
        return readdirSync(p, { withFileTypes: true }).map((e) => ({
          name: e.name,
          isFile: e.isFile(),
          isDirectory: e.isDirectory()
        }));
      } catch {
        return [];
      }
    },
    readText: (p) => {
      try {
        return readFileSync4(p, "utf8");
      } catch {
        return void 0;
      }
    },
    mtimeMs: (p) => {
      try {
        return statSync(p).mtimeMs;
      } catch {
        return void 0;
      }
    },
    env: (name2) => process.env[name2]
  };
}
function mtimeIso(fs, path6) {
  const ms = fs.mtimeMs(path6);
  return ms === void 0 ? void 0 : new Date(ms).toISOString();
}

// packages/kernel/dist/mem/adapters/opencode.js
import { createRequire } from "node:module";
import { join as join5 } from "node:path";

// packages/kernel/dist/mem/dialogue.js
var INJECTION_TAGS = [
  "system-reminder",
  "task-status",
  "ready",
  "current-state",
  "workflow",
  "workflow-state",
  "guidelines",
  "instructions",
  "command-name",
  "command-message",
  "command-args",
  "local-command-stdout",
  "local-command-stderr",
  "permissions instructions",
  "collaboration_mode",
  "environment_context",
  "auto_compact_summary",
  "user_instructions"
];
var ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;
function escapeRe(s) {
  return s.replace(ESCAPE_RE, (m) => "\\" + m);
}
var TAG_RES = INJECTION_TAGS.map((t) => new RegExp("<" + escapeRe(t) + "[^>]*>[\\s\\S]*?</" + escapeRe(t) + ">", "gi"));
var AGENTS_RE = /^# AGENTS\.md instructions for[\s\S]*?(?=\n\n[A-Z一-龥]|$)/gm;
var COLLAPSE_RE = /\n{3,}/g;
var INSTRUCTIONS_RE = /^<INSTRUCTIONS>/i;
function isBootstrapTurn(cleaned, originalLength) {
  if (cleaned.startsWith("# AGENTS.md instructions for"))
    return true;
  if (originalLength > 4e3 && INSTRUCTIONS_RE.test(cleaned))
    return true;
  return false;
}
function stripInjectionTags(text) {
  let out = text;
  for (const re of TAG_RES)
    out = out.replace(re, "");
  out = out.replace(AGENTS_RE, "");
  out = out.replace(COLLAPSE_RE, "\n\n");
  return out.trim();
}

// packages/kernel/dist/mem/filter.js
import { resolve, sep } from "node:path";
function parseIso(iso) {
  if (!iso)
    return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}
function inRangeOverlap(start, end, f) {
  const s = start || end;
  const e = end || start;
  if (!s && !e)
    return true;
  if (f.since != null && e) {
    const et = parseIso(e);
    if (et !== null && et < f.since)
      return false;
  }
  if (f.until != null && s) {
    const st = parseIso(s);
    if (st !== null && st > f.until)
      return false;
  }
  return true;
}
function sameProject(sessionCwd, target) {
  if (!target)
    return true;
  if (!sessionCwd)
    return false;
  const a = resolve(sessionCwd);
  const b = resolve(target);
  return a === b || a.startsWith(b + sep);
}

// packages/kernel/dist/mem/search.js
function relevanceScore(h) {
  const total = h.totalTurns ?? 0;
  if (total === 0)
    return 0;
  return (3 * (h.userCount ?? 0) + (h.asstCount ?? 0)) / total;
}
function chunkAround(text, hitIdx, maxChars) {
  const startPara = text.slice(0, hitIdx).lastIndexOf("\n\n");
  let start = startPara === -1 ? 0 : startPara + 2;
  const endPara = text.indexOf("\n\n", hitIdx);
  let end = endPara === -1 ? text.length : endPara;
  let truncated = false;
  if (end - start > maxChars) {
    start = Math.max(0, hitIdx - Math.floor(maxChars / 2));
    end = Math.min(text.length, hitIdx + Math.ceil(maxChars / 2));
    truncated = true;
  }
  return { start, end, truncated };
}
function searchInDialogue(turns, kw, maxExcerpts = 3, chunkChars = 400) {
  const tokens = kw.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { count: 0, userCount: 0, asstCount: 0, totalTurns: turns.length, excerpts: [] };
  }
  let userCount = 0;
  let asstCount = 0;
  const userExcerpts = [];
  const asstExcerpts = [];
  for (const t of turns) {
    const hay = t.text.toLowerCase();
    if (!tokens.every((tok) => hay.includes(tok)))
      continue;
    const hitPositions = [];
    const tokenFreq = /* @__PURE__ */ new Map();
    let turnHits = 0;
    for (const tok of tokens) {
      let frm = 0;
      let n = 0;
      for (; ; ) {
        const idx = hay.indexOf(tok, frm);
        if (idx === -1)
          break;
        n += 1;
        turnHits += 1;
        hitPositions.push({ idx, tok });
        frm = idx + tok.length;
      }
      tokenFreq.set(tok, n);
    }
    if (t.role === "user")
      userCount += turnHits;
    else
      asstCount += turnHits;
    hitPositions.sort((a, b) => a.idx - b.idx);
    const candidates = [];
    const seenStarts = /* @__PURE__ */ new Set();
    for (const { idx, tok } of hitPositions) {
      const ca = chunkAround(t.text, idx, chunkChars);
      if (seenStarts.has(ca.start))
        continue;
      seenStarts.add(ca.start);
      const sl = hay.slice(ca.start, ca.end);
      const coverage = tokens.reduce((acc, tk) => acc + (sl.includes(tk) ? 1 : 0), 0);
      const rarity = 1 / (tokenFreq.get(tok) || 1);
      candidates.push({ start: ca.start, end: ca.end, truncated: ca.truncated, coverage, rarity });
    }
    candidates.sort((a, b) => b.coverage - a.coverage || b.rarity - a.rarity || a.start - b.start);
    for (const c of candidates) {
      let snippet = t.text.slice(c.start, c.end).trim();
      if (c.truncated) {
        if (c.start > 0)
          snippet = "\u2026" + snippet;
        if (c.end < t.text.length)
          snippet = snippet + "\u2026";
      }
      const target = t.role === "user" ? userExcerpts : asstExcerpts;
      target.push({ role: t.role, snippet });
    }
  }
  const excerpts = [...userExcerpts, ...asstExcerpts].slice(0, maxExcerpts);
  return {
    count: userCount + asstCount,
    userCount,
    asstCount,
    totalTurns: turns.length,
    excerpts
  };
}

// packages/kernel/dist/mem/adapters/opencode.js
function loadSqlite() {
  try {
    const req = createRequire(import.meta.url);
    return req("node:sqlite");
  } catch {
    return null;
  }
}
function opencodeSqliteAvailable() {
  return loadSqlite() !== null;
}
function opencodeDbPath(fs) {
  const xdgData = fs.env?.("XDG_DATA_HOME");
  const dataHome = xdgData && xdgData.trim() ? xdgData : join5(fs.home, ".local", "share");
  return join5(dataHome, "opencode", "opencode.db");
}
function withOpenCodeDb(fs, fallback, fn) {
  const dbPath = opencodeDbPath(fs);
  if (!fs.exists(dbPath))
    return fallback;
  const sqlite = loadSqlite();
  if (!sqlite)
    return fallback;
  let db;
  try {
    db = new sqlite.DatabaseSync(dbPath, { readOnly: true });
    return fn(db);
  } catch {
    return fallback;
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
      }
    }
  }
}
function parseJson(raw) {
  if (typeof raw !== "string")
    return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function msToIso(ms) {
  return typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
function opencodeListSessions(fs, f) {
  const dbPath = opencodeDbPath(fs);
  return withOpenCodeDb(fs, [], (db) => {
    const rows = db.prepare("SELECT id, directory, title, parent_id, time_created, time_updated FROM session").all();
    const out = [];
    for (const row of rows) {
      const cwd = typeof row.directory === "string" && row.directory ? row.directory : null;
      if (f.cwd && !sameProject(cwd, f.cwd))
        continue;
      const created = msToIso(row.time_created);
      const updated = msToIso(row.time_updated);
      if (!inRangeOverlap(created, updated, f))
        continue;
      out.push({
        platform: "opencode",
        id: String(row.id),
        title: typeof row.title === "string" && row.title ? row.title : null,
        cwd,
        created,
        updated,
        filePath: dbPath,
        parent_id: typeof row.parent_id === "string" && row.parent_id ? row.parent_id : null
      });
    }
    return out;
  });
}
function roleOf(data) {
  return data?.role === "user" ? "user" : data?.role === "assistant" ? "assistant" : null;
}
function opencodeExtractDialogue(fs, s) {
  return withOpenCodeDb(fs, [], (db) => {
    const messageRows = db.prepare("SELECT id, data FROM message WHERE session_id = ? ORDER BY time_created, id").all(s.id);
    if (!messageRows.length)
      return [];
    const partRows = db.prepare("SELECT id, message_id, data FROM part WHERE session_id = ? ORDER BY time_created, id").all(s.id);
    const partsByMessage = /* @__PURE__ */ new Map();
    for (const p of partRows) {
      const mid = String(p.message_id);
      const list = partsByMessage.get(mid);
      if (list)
        list.push(p);
      else
        partsByMessage.set(mid, [p]);
    }
    const turns = [];
    for (const row of messageRows) {
      const role = roleOf(parseJson(row.data));
      if (!role)
        continue;
      const parts = partsByMessage.get(String(row.id)) ?? [];
      const collected = [];
      let totalRaw = 0;
      for (const p of parts) {
        const pdata = parseJson(p.data);
        if (!pdata || pdata.type !== "text" || typeof pdata.text !== "string")
          continue;
        totalRaw += pdata.text.length;
        const cleaned = stripInjectionTags(pdata.text);
        if (cleaned)
          collected.push(cleaned);
      }
      if (!collected.length)
        continue;
      const merged = collected.join("\n\n");
      if (isBootstrapTurn(merged, totalRaw))
        continue;
      turns.push({ role, text: merged });
    }
    return turns;
  });
}
function opencodeSearch(fsOrKw, s, kw) {
  if (typeof fsOrKw === "string")
    return searchInDialogue([], fsOrKw);
  return searchInDialogue(opencodeExtractDialogue(fsOrKw, s), kw);
}

// packages/kernel/dist/mem/phase.js
var FIND_RE = /(^|[\s/\\])task\.py\s+(create|start)(?:\s+|$)/g;
var PROSE_RE = /^[A-Za-z][A-Za-z0-9_-]*\s+[A-Za-z]{2,}\b/;
var SLUG_PREFIX_RE = /^\d{4}-\d{2}-\d{2}-/;
var TRAIL_META_RE = /[)};&|>]+$/;
function parseTaskPyCommandsAll(cmd) {
  if (typeof cmd !== "string" || cmd.length === 0)
    return [];
  const matches = [];
  FIND_RE.lastIndex = 0;
  let m;
  while ((m = FIND_RE.exec(cmd)) !== null) {
    matches.push({ action: m[2], bodyStart: m.index + m[0].length });
    if (m.index === FIND_RE.lastIndex)
      FIND_RE.lastIndex += 1;
  }
  const out = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const nxt = matches[i + 1];
    const bodyEnd = nxt ? nxt.bodyStart : cmd.length;
    const sl = cmd.slice(cur.bodyStart, bodyEnd);
    const restRaw = (sl.includes("\n") ? sl.split("\n")[0] : sl).trim();
    if (PROSE_RE.test(restRaw))
      continue;
    const parsed = parseRest(cur.action, restRaw);
    if (cur.action === "create" && !parsed.slug && !parsed.titleArg)
      continue;
    if (cur.action === "start" && !parsed.taskDir)
      continue;
    out.push(parsed);
  }
  return out;
}
function parseRest(action, restRaw) {
  if (action === "create") {
    const args2 = splitShellArgs(restRaw);
    let slug = null;
    let titleArg = null;
    let i = 0;
    while (i < args2.length) {
      const a = args2[i];
      if (a === "--slug" || a === "-s") {
        slug = args2[i + 1] ?? null;
        i += 2;
        continue;
      }
      if (a.startsWith("--slug=")) {
        slug = a.slice("--slug=".length);
        i += 1;
        continue;
      }
      if (a.startsWith("-")) {
        i += 1;
        continue;
      }
      if (titleArg === null)
        titleArg = a;
      i += 1;
    }
    return { action: "create", slug, titleArg };
  }
  const args = splitShellArgs(restRaw);
  let taskDir = null;
  for (const a of args) {
    if (a.startsWith("-"))
      continue;
    taskDir = a;
    break;
  }
  return { action: "start", taskDir };
}
function splitShellArgs(s) {
  const out = [];
  let cur = "";
  let quote = null;
  const flush = () => {
    if (!cur)
      return;
    const cleaned = cur.replace(TRAIL_META_RE, "");
    if (cleaned)
      out.push(cleaned);
    cur = "";
  };
  for (const ch of s) {
    if (quote) {
      if (ch === quote) {
        quote = null;
        continue;
      }
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    if (ch === ";" || ch === "|" || ch === "&" || ch === "(" || ch === ")") {
      flush();
      continue;
    }
    cur += ch;
  }
  flush();
  return out;
}
function slugFromChangeDir(p) {
  if (!p)
    return null;
  const norm2 = p.replace(/\\+/g, "/").replace(/\/+$/g, "");
  const parts = norm2.split("/").filter(Boolean);
  if (parts.length === 0)
    return null;
  const last = parts[parts.length - 1];
  return last.replace(SLUG_PREFIX_RE, "");
}
function buildBrainstormWindows(events, totalTurns) {
  const creates = events.map((e, i) => ({ e, i })).filter((x) => x.e.action === "create");
  const starts = events.map((e, i) => ({ e, i })).filter((x) => x.e.action === "start");
  const usedStart = /* @__PURE__ */ new Set();
  const usedCreate = /* @__PURE__ */ new Set();
  const windows = [];
  let counter = 0;
  const push = (startTurn, endTurn, slug) => {
    counter += 1;
    if (endTurn < startTurn)
      return;
    windows.push({ label: slug ? slug : `window-${counter}`, startTurn, endTurn });
  };
  for (const c of creates) {
    const createEv = c.e;
    if (!createEv.slug)
      continue;
    let matchIdx = -1;
    for (let j = 0; j < starts.length; j++) {
      const st = starts[j];
      if (!usedStart.has(st.i) && slugFromChangeDir(st.e.taskDir) === createEv.slug) {
        matchIdx = j;
        break;
      }
    }
    if (matchIdx === -1)
      continue;
    const startEntry = starts[matchIdx];
    usedStart.add(startEntry.i);
    usedCreate.add(c.i);
    push(createEv.turnIndex, startEntry.e.turnIndex, createEv.slug);
  }
  for (const c of creates) {
    if (usedCreate.has(c.i))
      continue;
    const createEv = c.e;
    let paired;
    for (const st of starts) {
      if (!usedStart.has(st.i) && st.i > c.i) {
        paired = st;
        break;
      }
    }
    if (paired) {
      usedStart.add(paired.i);
      usedCreate.add(c.i);
      const slug = createEv.slug || slugFromChangeDir(paired.e.taskDir);
      push(createEv.turnIndex, paired.e.turnIndex, slug);
    } else {
      usedCreate.add(c.i);
      push(createEv.turnIndex, totalTurns, createEv.slug);
    }
  }
  for (const st of starts) {
    if (usedStart.has(st.i))
      continue;
    push(0, st.e.turnIndex, slugFromChangeDir(st.e.taskDir));
  }
  windows.sort((a, b) => a.startTurn - b.startTurn);
  return windows;
}

// packages/kernel/dist/mem/adapters/claude.js
import { join as join7 } from "node:path";

// packages/kernel/dist/mem/jsonl.js
var OPEN_BRACE = 123;
function isJsonlLine(line) {
  return line.length > 0 && line.charCodeAt(0) === OPEN_BRACE;
}
function parseJsonlLines(text) {
  const out = [];
  if (!text)
    return out;
  for (const line of text.split("\n")) {
    if (!isJsonlLine(line))
      continue;
    try {
      out.push(JSON.parse(line));
    } catch {
    }
  }
  return out;
}
function readJsonlFirst(text) {
  if (!text)
    return void 0;
  for (const line of text.split("\n")) {
    if (!isJsonlLine(line))
      continue;
    try {
      return JSON.parse(line);
    } catch {
    }
  }
  return void 0;
}
function findInJsonl(text, predicate, maxLines = 200) {
  if (!text)
    return void 0;
  let count = 0;
  for (const line of text.split("\n")) {
    if (!isJsonlLine(line))
      continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    count += 1;
    if (predicate(obj))
      return obj;
    if (count >= maxLines)
      return void 0;
  }
  return void 0;
}

// packages/kernel/dist/mem/paths.js
import { join as join6, resolve as resolve2 } from "node:path";
var SEP_RE = /[/\\:_.]/g;
var PI_SEP_RE = /[/\\:]/g;
var PI_LEAD_RE = /^[/\\]/;
function expandHome(fs, p) {
  if (p === "~")
    return fs.home;
  if (p.startsWith("~/") || p.startsWith("~\\"))
    return join6(fs.home, p.slice(2));
  return p;
}
function claudeProjectsRoot(fs) {
  return join6(fs.home, ".claude", "projects");
}
function codexSessionsRoot(fs) {
  return join6(fs.home, ".codex", "sessions");
}
function claudeProjectDirFromCwd(fs, cwd) {
  return join6(claudeProjectsRoot(fs), cwd.replace(SEP_RE, "-"));
}
function piAgentDir(fs) {
  const env = fs.env?.("PI_CODING_AGENT_DIR");
  return expandHome(fs, env || join6(fs.home, ".pi", "agent"));
}
function piProjectDirFromCwd(fs, cwd) {
  const resolved = resolve2(cwd);
  const safe = "--" + resolved.replace(PI_LEAD_RE, "").replace(PI_SEP_RE, "-") + "--";
  return join6(piAgentDir(fs), "sessions", safe);
}
function readPiSettingsSessionDir(fs) {
  const raw = fs.readText(join6(piAgentDir(fs), "settings.json"));
  if (!raw)
    return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object")
    return null;
  const dir = parsed.sessionDir;
  if (typeof dir === "string" && dir.trim())
    return expandHome(fs, dir);
  return null;
}
function piSessionRoots(fs) {
  const roots = [join6(piAgentDir(fs), "sessions")];
  const envSess = fs.env?.("PI_CODING_AGENT_SESSION_DIR");
  if (envSess)
    roots.push(expandHome(fs, envSess));
  const settingsDir = readPiSettingsSessionDir(fs);
  if (settingsDir)
    roots.push(settingsDir);
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const root of roots) {
    const normalized = resolve2(root);
    if (seen.has(normalized))
      continue;
    seen.add(normalized);
    out.push(root);
  }
  return out;
}
function walkDir(fs, root) {
  const out = [];
  if (!fs.exists(root))
    return out;
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    for (const e of fs.readDir(cur)) {
      const full = join6(cur, e.name);
      if (e.isDirectory)
        stack.push(full);
      else if (e.isFile)
        out.push(full);
    }
  }
  return out;
}

// packages/kernel/dist/mem/adapters/claude.js
function claudeListSessions(fs, f) {
  const root = claudeProjectsRoot(fs);
  if (!fs.exists(root))
    return [];
  const out = [];
  const allDirs = () => fs.readDir(root).filter((e) => e.isDirectory).map((e) => join7(root, e.name));
  let projectDirs;
  if (f.cwd) {
    const derived = claudeProjectDirFromCwd(fs, f.cwd);
    projectDirs = fs.exists(derived) ? [derived] : allDirs();
  } else {
    projectDirs = allDirs();
  }
  for (const d of projectDirs) {
    const entries = fs.readDir(d);
    const indexRaw = fs.readText(join7(d, "sessions-index.json"));
    const indexById = /* @__PURE__ */ new Map();
    if (indexRaw) {
      try {
        const index = JSON.parse(indexRaw);
        const idxEntries = index && Array.isArray(index.entries) ? index.entries : [];
        for (const e of idxEntries)
          if (e && typeof e.id === "string")
            indexById.set(e.id, e);
      } catch {
      }
    }
    for (const e of entries) {
      if (!e.isFile || !e.name.endsWith(".jsonl"))
        continue;
      const filePath = join7(d, e.name);
      const sid = e.name.slice(0, -".jsonl".length);
      const idx = indexById.get(sid);
      let cwd = idx?.cwd ?? null;
      let created = idx?.created ?? null;
      const title = idx?.title ?? null;
      if (!cwd || !created) {
        const text = fs.readText(filePath);
        const evt = findInJsonl(text, (o) => typeof o?.cwd === "string", 100);
        cwd = cwd || (evt?.cwd ?? null);
        if (!created) {
          const first = readJsonlFirst(text);
          created = (evt?.timestamp ?? null) || (first?.timestamp ?? null);
        }
      }
      const updated = mtimeIso(fs, filePath);
      if (updated === void 0)
        continue;
      if (!inRangeOverlap(created, updated, f))
        continue;
      if (f.cwd && cwd && !sameProject(cwd, f.cwd))
        continue;
      out.push({ platform: "claude", id: sid, title, cwd, created, updated, filePath });
    }
  }
  return out;
}
function summaryText(content) {
  if (typeof content === "string")
    return stripInjectionTags(content);
  if (Array.isArray(content)) {
    const parts = [];
    for (const block of content) {
      if (block?.type === "text" && typeof block.text === "string") {
        const cleaned = stripInjectionTags(block.text);
        if (cleaned)
          parts.push(cleaned);
      }
    }
    return parts.join("\n\n");
  }
  return "";
}
function claudeExtractFromLines(lines) {
  let turns = [];
  for (const obj of lines) {
    const t = obj?.type;
    const msg = obj?.message;
    if (t === "user" && obj?.isCompactSummary === true) {
      const summary = summaryText(msg?.content);
      turns = summary ? [{ role: "user", text: `[compact summary]
${summary}` }] : [];
      continue;
    }
    if (!msg)
      continue;
    const content = msg.content;
    if (t === "user" && msg.role === "user") {
      if (typeof content === "string") {
        const text = stripInjectionTags(content);
        if (text && !isBootstrapTurn(text, content.length))
          turns.push({ role: "user", text });
      }
    } else if (t === "assistant" && msg.role === "assistant" && Array.isArray(content)) {
      const parts = [];
      for (const block of content) {
        if (block?.type === "text" && typeof block.text === "string") {
          const cleaned = stripInjectionTags(block.text);
          if (cleaned)
            parts.push(cleaned);
        }
      }
      if (parts.length)
        turns.push({ role: "assistant", text: parts.join("\n\n") });
    }
  }
  return turns;
}
function claudeExtractDialogue(fs, s) {
  return claudeExtractFromLines(parseJsonlLines(fs.readText(s.filePath)));
}
function claudeSearch(fs, s, kw) {
  return searchInDialogue(claudeExtractDialogue(fs, s), kw);
}
function collectClaudeTurnsAndEvents(fs, s) {
  const state = { turns: [], events: [] };
  for (const obj of parseJsonlLines(fs.readText(s.filePath))) {
    const o = obj;
    const t = o?.type;
    const msg = o?.message;
    if (t === "user" && o?.isCompactSummary === true) {
      const summary = summaryText(msg?.content);
      state.turns = summary ? [{ role: "user", text: `[compact summary]
${summary}` }] : [];
      state.events = [];
      continue;
    }
    if (!msg)
      continue;
    const content = msg.content;
    if (t === "user" && msg.role === "user") {
      if (typeof content === "string") {
        const text = stripInjectionTags(content);
        if (text && !isBootstrapTurn(text, content.length))
          state.turns.push({ role: "user", text });
      }
      continue;
    }
    if (t === "assistant" && msg.role === "assistant" && Array.isArray(content)) {
      const parts = [];
      for (const block of content) {
        const bt = block?.type;
        if (bt === "text" && typeof block.text === "string") {
          const cleaned = stripInjectionTags(block.text);
          if (cleaned)
            parts.push(cleaned);
        } else if (bt === "tool_use") {
          if (block?.name !== "Bash")
            continue;
          const inp = block?.input;
          if (!inp || typeof inp !== "object")
            continue;
          const command = inp.command;
          if (typeof command !== "string")
            continue;
          for (const parsed of parseTaskPyCommandsAll(command)) {
            const ev = { action: parsed.action, timestamp: o?.timestamp || "", turnIndex: state.turns.length };
            if (parsed.action === "create")
              ev.slug = parsed.slug;
            else
              ev.taskDir = parsed.taskDir;
            state.events.push(ev);
          }
        }
      }
      if (parts.length)
        state.turns.push({ role: "assistant", text: parts.join("\n\n") });
    }
  }
  return state;
}

// packages/kernel/dist/mem/adapters/codex.js
import { basename } from "node:path";
var ROLLOUT_RE = /^rollout-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-(.+)$/;
var TS_FIX_RE = /T(\d{2})-(\d{2})-(\d{2})/;
function parseDialogueRole(v) {
  return v === "user" || v === "assistant" ? v : null;
}
function commandFromCodexArguments(argsRaw) {
  const fromObject = (obj) => {
    if (typeof obj.cmd === "string")
      return obj.cmd;
    if (typeof obj.command === "string")
      return obj.command;
    if (Array.isArray(obj.argv)) {
      const parts = obj.argv.filter((a) => typeof a === "string");
      if (parts.length)
        return parts.join(" ");
    }
    return null;
  };
  if (typeof argsRaw === "string") {
    let parsed;
    try {
      parsed = JSON.parse(argsRaw);
    } catch {
      return argsRaw;
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      return fromObject(parsed);
    return null;
  }
  if (argsRaw && typeof argsRaw === "object")
    return fromObject(argsRaw);
  return null;
}
function normalizeIso(s) {
  const t = Date.parse(s);
  return Number.isNaN(t) ? "" : new Date(t).toISOString();
}
function codexListSessions(fs, f) {
  const root = codexSessionsRoot(fs);
  if (!fs.exists(root))
    return [];
  const out = [];
  for (const file of walkDir(fs, root)) {
    if (!file.endsWith(".jsonl"))
      continue;
    const base = basename(file).slice(0, -".jsonl".length);
    const m = ROLLOUT_RE.exec(base);
    let tsFromName = null;
    if (m) {
      const fixed = m[1].replace(TS_FIX_RE, "T$1:$2:$3") + "Z";
      tsFromName = normalizeIso(fixed);
    }
    const first = readJsonlFirst(fs.readText(file));
    const meta = first?.payload ?? null;
    const sid = (meta?.id ?? null) || (m ? m[2] : null) || base;
    const cwd = meta?.cwd ?? null;
    const created = (first?.timestamp ?? null) || tsFromName || "";
    if (f.cwd && !sameProject(cwd, f.cwd))
      continue;
    const updated = mtimeIso(fs, file);
    if (updated === void 0)
      continue;
    if (!inRangeOverlap(created, updated, f))
      continue;
    out.push({ platform: "codex", id: sid, cwd, created, updated, filePath: file });
  }
  return out;
}
function buildTurnFromMessage(role, parts) {
  const collected = [];
  let totalRaw = 0;
  for (const c of parts ?? []) {
    const txt = c?.text;
    if (typeof txt !== "string")
      continue;
    if (c?.type !== "input_text" && c?.type !== "output_text")
      continue;
    totalRaw += txt.length;
    const cleaned = stripInjectionTags(txt);
    if (cleaned)
      collected.push(cleaned);
  }
  if (!collected.length)
    return null;
  const merged = collected.join("\n\n");
  if (isBootstrapTurn(merged, totalRaw))
    return null;
  return { role, text: merged };
}
function codexExtractDialogue(fs, s) {
  let turns = [];
  for (const obj of parseJsonlLines(fs.readText(s.filePath))) {
    const o = obj;
    if (o?.type === "compacted") {
      const rh = o?.payload?.replacement_history;
      turns = [];
      if (!Array.isArray(rh))
        continue;
      for (const item of rh) {
        if (item?.type !== "message")
          continue;
        const role2 = parseDialogueRole(item?.role);
        if (!role2)
          continue;
        const turn2 = buildTurnFromMessage(role2, item?.content);
        if (turn2)
          turns.push({ role: turn2.role, text: `[compact]
${turn2.text}` });
      }
      continue;
    }
    const p = o?.payload;
    if (!p || p.type !== "message")
      continue;
    const role = parseDialogueRole(p.role);
    if (!role)
      continue;
    const turn = buildTurnFromMessage(role, p.content);
    if (turn)
      turns.push(turn);
  }
  return turns;
}
function codexSearch(fs, s, kw) {
  return searchInDialogue(codexExtractDialogue(fs, s), kw);
}
function collectCodexTurnsAndEvents(fs, s) {
  const state = { turns: [], events: [] };
  for (const obj of parseJsonlLines(fs.readText(s.filePath))) {
    const o = obj;
    if (o?.type === "compacted") {
      const rh = o?.payload?.replacement_history;
      state.turns = [];
      state.events = [];
      if (!Array.isArray(rh))
        continue;
      for (const item of rh) {
        if (item?.type !== "message")
          continue;
        const role2 = parseDialogueRole(item?.role);
        if (!role2)
          continue;
        const turn2 = buildTurnFromMessage(role2, item?.content);
        if (turn2)
          state.turns.push({ role: turn2.role, text: `[compact]
${turn2.text}` });
      }
      continue;
    }
    const p = o?.payload;
    if (!p)
      continue;
    if (p.type === "function_call") {
      if (p.name !== "exec_command" && p.name !== "shell")
        continue;
      const cmd = commandFromCodexArguments(p.arguments);
      if (!cmd)
        continue;
      for (const parsed of parseTaskPyCommandsAll(cmd)) {
        const ev = { action: parsed.action, timestamp: o?.timestamp || "", turnIndex: state.turns.length };
        if (parsed.action === "create")
          ev.slug = parsed.slug;
        else
          ev.taskDir = parsed.taskDir;
        state.events.push(ev);
      }
      continue;
    }
    if (p.type !== "message")
      continue;
    const role = parseDialogueRole(p.role);
    if (!role)
      continue;
    const turn = buildTurnFromMessage(role, p.content);
    if (turn)
      state.turns.push(turn);
  }
  return state;
}

// packages/kernel/dist/mem/adapters/pi.js
import { basename as basename2, join as join8, resolve as resolve3 } from "node:path";
function piListSessions(fs, f) {
  const out = [];
  for (const filePath of candidateFiles(fs, f)) {
    const header = readJsonlFirst(fs.readText(filePath));
    if (!header || header.type !== "session")
      continue;
    const sid = typeof header.id === "string" ? header.id : idFromFile(filePath);
    const cwd = typeof header.cwd === "string" ? header.cwd : null;
    if (f.cwd && !sameProject(cwd, f.cwd))
      continue;
    let title = null;
    let lastMs = null;
    for (const entry of parseJsonlLines(fs.readText(filePath))) {
      const e = entry;
      if (e?.type === "session_info") {
        const name2 = e.name;
        title = typeof name2 === "string" && name2.trim() ? name2.trim() : null;
        continue;
      }
      if (e?.type !== "message")
        continue;
      const msg = e.message ?? {};
      const role = msg.role;
      if (role !== "user" && role !== "assistant")
        continue;
      let activity = timestampMs(msg.timestamp);
      if (activity === null)
        activity = timestampMs(e.timestamp);
      if (activity !== null)
        lastMs = Math.max(lastMs ?? 0, activity);
    }
    let updated;
    if (lastMs !== null)
      updated = new Date(lastMs).toISOString();
    else
      updated = mtimeIso(fs, filePath);
    const created = typeof header.timestamp === "string" ? header.timestamp : null;
    if (!inRangeOverlap(created, updated, f))
      continue;
    out.push({ platform: "pi", id: sid, title, cwd, created, updated: updated ?? null, filePath });
  }
  return out;
}
function candidateFiles(fs, f) {
  const defaultRoot = join8(piAgentDir(fs), "sessions");
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  const pushJsonl = (root) => {
    if (!fs.exists(root))
      return;
    for (const file of walkDir(fs, root)) {
      if (!file.endsWith(".jsonl"))
        continue;
      const normalized = resolve3(file);
      if (seen.has(normalized))
        continue;
      seen.add(normalized);
      out.push(file);
    }
  };
  for (const root of piSessionRoots(fs)) {
    if (f.cwd && resolve3(root) === resolve3(defaultRoot))
      pushJsonl(piProjectDirFromCwd(fs, f.cwd));
    else
      pushJsonl(root);
  }
  return out;
}
function idFromFile(filePath) {
  const base = basename2(filePath).slice(0, -".jsonl".length);
  const underscore = base.indexOf("_");
  return underscore === -1 ? base : base.slice(underscore + 1);
}
function timestampMs(value) {
  if (typeof value === "number" && !Number.isNaN(value))
    return Math.trunc(value);
  if (typeof value !== "string")
    return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}
function piExtractDialogue(fs, s) {
  return buildPiTurnsAndEvents(fs, s).turns;
}
function piSearch(fs, s, kw) {
  return searchInDialogue(piExtractDialogue(fs, s), kw);
}
function collectPiTurnsAndEvents(fs, s) {
  return buildPiTurnsAndEvents(fs, s);
}
function buildPiTurnsAndEvents(fs, s) {
  const effective = effectiveActivePath(fs, s.filePath);
  const turns = [];
  const events = [];
  for (const entry of effective) {
    collectTaskEvents(entry, turns.length, events);
    const turn = turnFromEntry(entry);
    if (turn)
      turns.push(turn);
  }
  return { turns, events };
}
function effectiveActivePath(fs, filePath) {
  const entries = [];
  for (const entry of parseJsonlLines(fs.readText(filePath))) {
    const e = entry;
    if (e?.type === "session")
      continue;
    if (typeof e?.id !== "string")
      continue;
    entries.push(e);
  }
  if (!entries.length)
    return [];
  const byId = /* @__PURE__ */ new Map();
  for (const entry of entries)
    if (typeof entry.id === "string")
      byId.set(entry.id, entry);
  const leaf = entries[entries.length - 1];
  const activePath = [];
  let current = leaf;
  const seen = /* @__PURE__ */ new Set();
  while (current) {
    const cid = current.id;
    if (typeof cid !== "string" || seen.has(cid))
      break;
    seen.add(cid);
    activePath.unshift(current);
    const parentId = current.parentId;
    current = typeof parentId === "string" ? byId.get(parentId) : void 0;
  }
  const compactionIdx = findLastIndex(activePath, (e) => e?.type === "compaction");
  if (compactionIdx === -1)
    return activePath;
  const compaction = activePath[compactionIdx];
  let firstKeptIdx = -1;
  for (let idx = 0; idx < activePath.length; idx++) {
    if (idx < compactionIdx && activePath[idx]?.id === compaction?.firstKeptEntryId) {
      firstKeptIdx = idx;
      break;
    }
  }
  const kept = firstKeptIdx === -1 ? [] : activePath.slice(firstKeptIdx, compactionIdx);
  return [compaction, ...kept, ...activePath.slice(compactionIdx + 1)];
}
function findLastIndex(items, pred) {
  for (let i = items.length - 1; i >= 0; i--)
    if (pred(items[i]))
      return i;
  return -1;
}
function turnFromEntry(entry) {
  const etype = entry?.type;
  if (etype === "compaction")
    return syntheticTurn("[compact summary]", entry?.summary);
  if (etype === "branch_summary")
    return syntheticTurn("[branch summary]", entry?.summary);
  if (etype === "custom_message")
    return buildTurn("user", entry?.content);
  if (etype !== "message")
    return null;
  const msg = entry?.message;
  if (!msg)
    return null;
  const role = msg.role;
  if (role === "user")
    return buildTurn("user", msg.content);
  if (role === "assistant")
    return buildTurn("assistant", msg.content);
  if (role === "custom")
    return buildTurn("user", msg.content);
  if (role === "branchSummary")
    return syntheticTurn("[branch summary]", msg.summary);
  if (role === "compactionSummary")
    return syntheticTurn("[compact summary]", msg.summary);
  return null;
}
function syntheticTurn(prefix, raw) {
  if (typeof raw !== "string")
    return null;
  const text = stripInjectionTags(raw);
  if (!text)
    return null;
  return { role: "user", text: `${prefix}
${text}` };
}
function buildTurn(role, content) {
  const parts = [];
  let totalRaw = 0;
  if (typeof content === "string") {
    totalRaw = content.length;
    const cleaned = stripInjectionTags(content);
    if (cleaned)
      parts.push(cleaned);
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (block?.type !== "text" || typeof block.text !== "string")
        continue;
      totalRaw += block.text.length;
      const cleaned = stripInjectionTags(block.text);
      if (cleaned)
        parts.push(cleaned);
    }
  }
  if (!parts.length)
    return null;
  const merged = parts.join("\n\n");
  if (isBootstrapTurn(merged, totalRaw))
    return null;
  return { role, text: merged };
}
function collectTaskEvents(entry, turnIndex, events) {
  if (entry?.type !== "message")
    return;
  const msg = entry?.message;
  if (!msg)
    return;
  if (msg.role === "bashExecution" && typeof msg.command === "string") {
    pushTaskEvents(msg.command, entry?.timestamp, turnIndex, events);
    return;
  }
  if (msg.role !== "assistant" || !Array.isArray(msg.content))
    return;
  for (const block of msg.content) {
    if (block?.type !== "toolCall")
      continue;
    if (typeof block.name !== "string")
      continue;
    const toolName = block.name.toLowerCase();
    if (toolName !== "bash" && toolName !== "shell")
      continue;
    const args = block.arguments;
    if (!args || typeof args !== "object")
      continue;
    const command = args.command;
    if (typeof command !== "string")
      continue;
    pushTaskEvents(command, entry?.timestamp, turnIndex, events);
  }
}
function pushTaskEvents(command, timestamp, turnIndex, events) {
  for (const parsed of parseTaskPyCommandsAll(command)) {
    const ev = {
      action: parsed.action,
      timestamp: (typeof timestamp === "string" ? timestamp : "") || "",
      turnIndex
    };
    if (parsed.action === "create")
      ev.slug = parsed.slug;
    else
      ev.taskDir = parsed.taskDir;
    events.push(ev);
  }
}

// packages/kernel/dist/mem/sessions.js
var WIDE_LIMIT = 1e6;
var MemSessionNotFoundError = class extends Error {
  sessionId;
  constructor(sessionId) {
    super(`mem session not found: ${sessionId}`);
    this.sessionId = sessionId;
    this.name = "MemSessionNotFoundError";
  }
};
function resolveFilter(filt) {
  const f = filt ?? {};
  return {
    platform: f.platform ?? "all",
    since: f.since ?? null,
    until: f.until ?? null,
    cwd: f.cwd === void 0 ? null : f.cwd,
    limit: f.limit ?? 50
  };
}
function recencyKey(s) {
  return s.updated || s.created || "";
}
function recencyDesc(a, b) {
  const ka = recencyKey(a);
  const kb = recencyKey(b);
  return ka < kb ? 1 : ka > kb ? -1 : 0;
}
function listAll(fs, f) {
  const platform = f.platform;
  const all = [];
  if (platform === "all" || platform === "claude")
    all.push(...claudeListSessions(fs, f));
  if (platform === "all" || platform === "codex")
    all.push(...codexListSessions(fs, f));
  if (platform === "all" || platform === "opencode")
    all.push(...opencodeListSessions(fs, f));
  if (platform === "all" || platform === "pi")
    all.push(...piListSessions(fs, f));
  all.sort(recencyDesc);
  return all.slice(0, f.limit);
}
function extractDialogue(fs, s) {
  switch (s.platform) {
    case "claude":
      return claudeExtractDialogue(fs, s);
    case "codex":
      return codexExtractDialogue(fs, s);
    case "opencode":
      return opencodeExtractDialogue(fs, s);
    case "pi":
      return piExtractDialogue(fs, s);
    default:
      return [];
  }
}
function searchSession(fs, s, kw) {
  switch (s.platform) {
    case "claude":
      return claudeSearch(fs, s, kw);
    case "codex":
      return codexSearch(fs, s, kw);
    case "opencode":
      return opencodeSearch(fs, s, kw);
    case "pi":
      return piSearch(fs, s, kw);
    default:
      return searchInDialogue([], kw);
  }
}
function collectTurnsAndEvents(fs, s) {
  switch (s.platform) {
    case "claude":
      return collectClaudeTurnsAndEvents(fs, s);
    case "codex":
      return collectCodexTurnsAndEvents(fs, s);
    case "opencode":
      return { turns: opencodeExtractDialogue(fs, s), events: [] };
    case "pi":
      return collectPiTurnsAndEvents(fs, s);
    default:
      return { turns: [], events: [] };
  }
}
function buildChildIndex(sessions) {
  const directChildren2 = /* @__PURE__ */ new Map();
  for (const s of sessions) {
    const pid = s.parent_id;
    if (!pid)
      continue;
    const arr = directChildren2.get(pid) ?? [];
    arr.push(s);
    directChildren2.set(pid, arr);
  }
  const out = /* @__PURE__ */ new Map();
  for (const pid of directChildren2.keys()) {
    const stack = [...directChildren2.get(pid) ?? []];
    const flat = [];
    while (stack.length) {
      const cur = stack.pop();
      flat.push(cur);
      for (const c of directChildren2.get(cur.id) ?? [])
        stack.push(c);
    }
    out.set(pid, flat);
  }
  return out;
}
function searchSessionWithChildren(fs, s, kw, childIndex) {
  const children = childIndex.get(s.id) ?? [];
  if (!children.length)
    return searchSession(fs, s, kw);
  const merged = [...extractDialogue(fs, s)];
  for (const c of children)
    merged.push(...extractDialogue(fs, c));
  return searchInDialogue(merged, kw);
}
function findSessionById(fs, sid, f) {
  const wide = { ...resolveFilter(f), cwd: null, limit: WIDE_LIMIT };
  const all = listAll(fs, wide);
  for (const s of all)
    if (s.id === sid)
      return s;
  for (const s of all)
    if (s.id.startsWith(sid))
      return s;
  return null;
}
function slicePhasePure(turns, events, phase) {
  const warnings = [];
  const windows = buildBrainstormWindows(events, turns.length);
  if (phase === "brainstorm") {
    if (!windows.length) {
      warnings.push({
        code: "no-brainstorm-boundary",
        message: "no task.py create/start boundary found in session \u2014 returning full dialogue."
      });
      return { groups: [{ label: null, turns }], windows: [], totalTurns: turns.length, warnings };
    }
    const groups = windows.map((w) => ({ label: w.label, turns: turns.slice(w.startTurn, w.endTurn) }));
    return { groups, windows, totalTurns: turns.length, warnings };
  }
  if (!windows.length) {
    warnings.push({
      code: "no-brainstorm-boundary",
      message: "no task.py create/start boundary found in session \u2014 implement phase is empty."
    });
    return { groups: [{ label: null, turns: [] }], windows: [], totalTurns: turns.length, warnings };
  }
  const covered = /* @__PURE__ */ new Set();
  for (const w of windows)
    for (let i = w.startTurn; i < w.endTurn; i++)
      covered.add(i);
  const implementTurns = turns.filter((_t, i) => !covered.has(i));
  return { groups: [{ label: null, turns: implementTurns }], windows, totalTurns: turns.length, warnings };
}
function sliceMemPhase(fs, s, phase) {
  const warnings = [];
  if (phase === "all" || s.platform === "opencode") {
    if (phase !== "all" && s.platform === "opencode") {
      warnings.push({
        code: "opencode-phase-unsupported",
        message: `--phase ${phase} on platform=opencode is not yet supported; returning full dialogue.`
      });
    }
    const turns = extractDialogue(fs, s);
    return { groups: [{ label: null, turns }], windows: [], totalTurns: turns.length, warnings };
  }
  const collected = collectTurnsAndEvents(fs, s);
  return slicePhasePure(collected.turns, collected.events, phase);
}
function applyGrep(turns, grepLc) {
  if (!grepLc)
    return turns;
  return turns.filter((t) => t.text.toLowerCase().includes(grepLc));
}
function listMemSessions(fs, options) {
  return listAll(fs, resolveFilter(options?.filter));
}
function searchMemSessions(fs, options) {
  const f = resolveFilter(options.filter);
  const kw = options.keyword;
  const includeChildren = options.includeChildren === true;
  const wide = { ...f, limit: WIDE_LIMIT };
  const candidates = listAll(fs, wide);
  const childIndex = includeChildren ? buildChildIndex(candidates) : /* @__PURE__ */ new Map();
  const candidateIds = new Set(candidates.map((s) => s.id));
  const isAbsorbedChild = (s) => includeChildren && s.parent_id != null && candidateIds.has(s.parent_id);
  const matches = [];
  for (const s of candidates) {
    if (isAbsorbedChild(s))
      continue;
    const hit = includeChildren ? searchSessionWithChildren(fs, s, kw, childIndex) : searchSession(fs, s, kw);
    if (hit.count === 0)
      continue;
    matches.push({ session: s, hit, score: relevanceScore(hit), descendantsMerged: (childIndex.get(s.id) ?? []).length });
  }
  matches.sort((a, b) => b.score - a.score || b.hit.count - a.hit.count || recencyDesc(a.session, b.session));
  return { matches: matches.slice(0, f.limit), totalMatches: matches.length, warnings: [] };
}
function extractMemDialogue(fs, options) {
  const f = resolveFilter(options.filter);
  const phase = options.phase ?? "all";
  const s = findSessionById(fs, options.sessionId, f);
  if (!s)
    throw new MemSessionNotFoundError(options.sessionId);
  const sl = sliceMemPhase(fs, s, phase);
  const grepLc = typeof options.grep === "string" ? options.grep.toLowerCase() : null;
  const groups = sl.groups.map((g) => ({ label: g.label, turns: applyGrep(g.turns, grepLc) }));
  const flat = [];
  for (const g of groups)
    flat.push(...g.turns);
  return {
    session: s,
    phase,
    windows: sl.windows,
    totalTurns: sl.totalTurns,
    groups,
    turns: flat,
    warnings: sl.warnings
  };
}

// packages/kernel/dist/mem/context.js
function selectContextTurns(turns, grep, nTurns, around, maxChars) {
  let hitIndices = [];
  let totalHitTurns = 0;
  if (grep) {
    const tokens = grep.toLowerCase().split(/\s+/).filter(Boolean);
    const matchCount = (text) => {
      const hay = text.toLowerCase();
      if (!tokens.every((tok) => hay.includes(tok)))
        return 0;
      let n = 0;
      for (const tok of tokens) {
        let frm = 0;
        for (; ; ) {
          const idx = hay.indexOf(tok, frm);
          if (idx === -1)
            break;
          n += 1;
          frm = idx + tok.length;
        }
      }
      return n;
    };
    const ranked = [];
    turns.forEach((turn, i) => {
      if (turn == null)
        return;
      const h = tokens.length === 0 ? 0 : matchCount(turn.text);
      if (h > 0)
        ranked.push({ idx: i, role: turn.role, hits: h });
    });
    totalHitTurns = ranked.length;
    ranked.sort((a, b) => (a.role === "user" ? 0 : 1) - (b.role === "user" ? 0 : 1) || b.hits - a.hits || a.idx - b.idx);
    hitIndices = ranked.slice(0, nTurns).map((r) => r.idx);
  } else {
    for (let i = 0; i < Math.min(nTurns, turns.length); i++)
      hitIndices.push(i);
  }
  const display2 = /* @__PURE__ */ new Set();
  for (const idx of hitIndices) {
    const lo = Math.max(0, idx - around);
    const hi = Math.min(turns.length - 1, idx + around);
    for (let j = lo; j <= hi; j++)
      display2.add(j);
  }
  const ordered = [...display2].sort((a, b) => a - b);
  const hitSet = new Set(hitIndices);
  const out = [];
  let used = 0;
  for (const i of ordered) {
    const t = turns[i];
    if (t == null)
      continue;
    let text = t.text;
    const cap = Math.floor(maxChars / 2);
    if (text.length > cap)
      text = text.slice(0, cap) + `
\u2026[+${t.text.length - cap} chars]`;
    if (used + text.length > maxChars && out.length > 0)
      break;
    out.push({ idx: i, role: t.role, text, isHit: hitSet.has(i) });
    used += text.length;
  }
  return { turns: out, totalHitTurns, budgetUsed: used };
}
function readMemContext(fs, options) {
  const f = resolveFilter(options.filter);
  const s = findSessionById(fs, options.sessionId, f);
  if (!s)
    throw new MemSessionNotFoundError(options.sessionId);
  const grep = typeof options.grep === "string" ? options.grep : null;
  const nTurns = options.turns ?? 3;
  const around = options.around ?? 1;
  const maxChars = options.maxChars ?? 6e3;
  let turns = extractDialogue(fs, s);
  let mergedChildren = 0;
  if (options.includeChildren === true) {
    const wide = { ...f, cwd: null, limit: WIDE_LIMIT };
    const all = listAll(fs, wide);
    const childIndex = buildChildIndex(all);
    const kids = childIndex.get(s.id) ?? [];
    mergedChildren = kids.length;
    for (const c of kids)
      turns = turns.concat(extractDialogue(fs, c));
  }
  const selected = selectContextTurns(turns, grep, nTurns, around, maxChars);
  return {
    session: s,
    query: grep,
    totalTurns: turns.length,
    totalHitTurns: selected.totalHitTurns,
    mergedChildren,
    budgetUsed: selected.budgetUsed,
    maxChars,
    turns: selected.turns,
    warnings: []
  };
}

// packages/kernel/dist/mem/projects.js
function listMemProjects(fs, options) {
  const f = resolveFilter(options?.filter);
  const wide = { ...f, cwd: null, limit: WIDE_LIMIT };
  const all = listAll(fs, wide);
  const byCwd = /* @__PURE__ */ new Map();
  for (const s of all) {
    const cwd = s.cwd;
    if (!cwd)
      continue;
    const ts = s.updated || s.created || "";
    let agg = byCwd.get(cwd);
    if (!agg) {
      agg = { cwd, last_active: ts, sessions: 0, by_platform: { claude: 0, codex: 0, opencode: 0, pi: 0 } };
      byCwd.set(cwd, agg);
    }
    agg.sessions += 1;
    agg.by_platform[s.platform] += 1;
    if (ts > agg.last_active)
      agg.last_active = ts;
  }
  return [...byCwd.values()].sort((a, b) => a.last_active < b.last_active ? 1 : a.last_active > b.last_active ? -1 : 0);
}

// packages/kernel/dist/channel/events.js
var CHANNEL_EVENT_KINDS = [
  // 会话/结构类
  "create",
  "join",
  "leave",
  "message",
  "thread",
  "context",
  "channel",
  // worker 生命周期类
  "spawned",
  "killed",
  "respawned",
  "progress",
  "done",
  "error",
  "waiting",
  "awake",
  // 投递/中断/turn 类
  "undeliverable",
  "interrupt_requested",
  "turn_started",
  "turn_finished",
  "interrupted",
  "supervisor_warning"
];
var KIND_SET = new Set(CHANNEL_EVENT_KINDS);
var VALID_ORIGINS = ["cli", "api", "worker"];
var ORIGIN_SET = new Set(VALID_ORIGINS);
function parseChannelKind(v) {
  if (v === void 0 || v === null)
    return void 0;
  if (!KIND_SET.has(v)) {
    throw new Error(`\u672A\u77E5 channel event kind: '${v}'\u3002\u5408\u6CD5 kind: ${CHANNEL_EVENT_KINDS.join(", ")}`);
  }
  return v;
}
function validateEventBase(partial) {
  const idem = partial.idempotencyKey;
  if (idem !== void 0 && idem !== null) {
    if (typeof idem !== "string" || idem.trim() === "") {
      throw new Error("idempotencyKey \u82E5\u63D0\u4F9B\u4E0D\u80FD\u662F\u7A7A\u767D\u4E32");
    }
  }
  const origin = partial.origin;
  if (origin !== void 0 && origin !== null && !ORIGIN_SET.has(origin)) {
    throw new Error(`\u975E\u6CD5 origin: '${origin}'\uFF08\u5408\u6CD5: ${[...VALID_ORIGINS].sort().join(", ")}\uFF09`);
  }
  const meta = partial.meta;
  if (meta !== void 0 && meta !== null && (typeof meta !== "object" || Array.isArray(meta))) {
    throw new Error("meta \u5FC5\u987B\u662F plain object\uFF08dict\uFF09");
  }
}
function parseEventsText(text) {
  const out = [];
  if (!text)
    return out;
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s)
      continue;
    let obj;
    try {
      obj = JSON.parse(s);
    } catch {
      continue;
    }
    if (obj !== null && typeof obj === "object" && !Array.isArray(obj)) {
      out.push(obj);
    }
  }
  return out;
}
function findIdempotentEvent(text, key, kind) {
  if (!text)
    return void 0;
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s)
      continue;
    let obj;
    try {
      obj = JSON.parse(s);
    } catch {
      continue;
    }
    if (obj !== null && typeof obj === "object" && obj.idempotencyKey === key) {
      const existing = obj;
      if (existing.kind === kind)
        return existing;
      throw new Error(`idempotencyKey '${key}' \u5DF2\u88AB kind='${existing.kind}' \u7528\u8FC7\uFF0C\u4E0D\u80FD\u518D\u7ED9 kind='${kind}'`);
    }
  }
  return void 0;
}

// packages/kernel/dist/channel/seq.js
var SIDECAR_RE = /^[0-9]+$/;
function parseSidecar(text) {
  const t = text.replace(/\n$/, "");
  if (!SIDECAR_RE.test(t))
    return void 0;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0)
    return void 0;
  return n;
}
function lastSeqInLines(lines) {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const s = (lines[i] ?? "").trim();
    if (!s)
      continue;
    let obj;
    try {
      obj = JSON.parse(s);
    } catch {
      continue;
    }
    if (obj !== null && typeof obj === "object") {
      const seq2 = obj.seq;
      if (typeof seq2 === "number" && Number.isInteger(seq2))
        return seq2;
    }
  }
  return void 0;
}
function readLastJsonlSeqFromText(text) {
  if (text.length === 0)
    return 0;
  const lines = text.split("\n");
  const found = lastSeqInLines(lines);
  if (found !== void 0)
    return found;
  if (lines.some((ln) => ln.trim().length > 0)) {
    throw new Error("\u65E0\u6CD5\u6062\u590D last seq\uFF08\u6709\u975E\u7A7A\u884C\u4F46\u65E0\u53EF\u89E3\u6790\u7684 seq\uFF09\u2014\u2014\u5B81\u5D29\u4E0D\u731C\uFF08\u731C\u4F1A\u5BFC\u81F4\u91CD\u590D seq\uFF09");
  }
  return 0;
}
function nextSeq(lastSeq) {
  return lastSeq + 1;
}

// packages/kernel/dist/channel/paths.js
import { isAbsolute, join as join9, resolve as resolve4 } from "node:path";
var GLOBAL_BUCKET = "_global";
function resolveRoot(home, envRoot) {
  const env = (envRoot ?? "").trim();
  if (env)
    return env;
  return join9(home, ".trellis", "channels");
}
function sanitizeBucket(s) {
  const folded = s.replace(/[\\/_]/g, "-").replace(/[^A-Za-z0-9.-]/g, "-");
  return folded || "-";
}
function projectKey(env) {
  const override = (env.projectOverride ?? "").trim();
  if (override)
    return sanitizeBucket(override);
  const base = isAbsolute(env.cwd) ? env.cwd : resolve4(env.cwd);
  return sanitizeBucket(base);
}
function bucketFor(env, scope) {
  return scope === "global" ? GLOBAL_BUCKET : projectKey(env);
}
function channelDir(env, name2, scope = "project") {
  return join9(env.root, bucketFor(env, scope), name2);
}
function bucketDir(env, scope = "project") {
  return join9(env.root, bucketFor(env, scope));
}
function eventsPath(env, name2, scope = "project") {
  return join9(channelDir(env, name2, scope), "events.jsonl");
}
function seqPath(env, name2, scope = "project") {
  return join9(channelDir(env, name2, scope), ".seq");
}
function lockPath(env, name2, scope = "project") {
  return join9(channelDir(env, name2, scope), `${name2}.lock`);
}
function workerFile(env, name2, worker, suffix, scope = "project") {
  return join9(channelDir(env, name2, scope), `${worker}.${suffix}`);
}

// packages/kernel/dist/channel/filters.js
var MEANINGFUL_EVENT_KINDS = /* @__PURE__ */ new Set([
  "create",
  "join",
  "leave",
  "message",
  "thread",
  "context",
  "channel",
  "spawned",
  "killed",
  "respawned",
  "done",
  "error"
]);
function targets(ev) {
  const to = ev.to;
  if (to === void 0 || to === null)
    return [];
  if (typeof to === "string")
    return to ? [to] : [];
  if (Array.isArray(to))
    return to.filter((t) => typeof t === "string" && t.length > 0);
  return [];
}
function matchesInboxPolicy(ev, workerId, policy = "explicitOnly") {
  if (ev.kind !== "message")
    return false;
  if (ev.by === workerId)
    return false;
  const tg = targets(ev);
  if (tg.length > 0)
    return tg.includes(workerId);
  return policy === "broadcastAndExplicit";
}
function classifyDelivery(targetList, registryWorkers, mode = "requireRunningWorker") {
  if (mode === "appendOnly")
    return [];
  if (targetList.length === 0)
    return [];
  const known = new Map(registryWorkers.map((w) => [w.id, w]));
  const out = [];
  for (const t of targetList) {
    const w = known.get(t);
    if (w === void 0) {
      out.push([t, "worker-unknown"]);
    } else if (mode === "requireRunningWorker" && w.terminal) {
      out.push([t, "worker-terminal"]);
    }
  }
  return out;
}
function matchesEventFilter(ev, opts = {}) {
  const kind = ev.kind;
  const by = ev.by;
  if (opts.selfId !== void 0 && by === opts.selfId)
    return false;
  const hasExplicitKind = typeof opts.wantKind === "string" && opts.wantKind.length > 0 || Array.isArray(opts.wantKind) && opts.wantKind.length > 0;
  if (!opts.includeNonMeaningful && !hasExplicitKind && !MEANINGFUL_EVENT_KINDS.has(kind)) {
    return false;
  }
  if (!opts.includeProgress && kind === "progress" && !hasExplicitKind)
    return false;
  if (opts.wantKind !== void 0) {
    if (typeof opts.wantKind === "string") {
      if (opts.wantKind && kind !== opts.wantKind)
        return false;
    } else if (opts.wantKind.length > 0) {
      if (!opts.wantKind.includes(kind))
        return false;
    }
  }
  if (opts.threadKey !== void 0) {
    if (kind !== "thread" || ev.thread !== opts.threadKey)
      return false;
  }
  if (opts.threadAction !== void 0) {
    if (kind !== "thread" || ev.action !== opts.threadAction)
      return false;
  }
  if (opts.fromBy !== void 0) {
    const allow = typeof opts.fromBy === "string" ? [opts.fromBy] : opts.fromBy;
    if (!allow.includes(by))
      return false;
  }
  if (opts.toFilter !== void 0) {
    const tg = targets(ev);
    if (opts.toFilter === "exclusive") {
      if (tg.length === 0)
        return false;
    } else {
      const want = typeof opts.toFilter === "string" ? [opts.toFilter] : opts.toFilter;
      if (tg.length > 0 && !tg.some((t) => want.includes(t)))
        return false;
    }
  }
  return true;
}

// packages/kernel/dist/channel/worker-state.js
var SUPERVISOR_PREFIX = "supervisor:";
function identifyWorker(ev) {
  const kind = ev.kind;
  const by = typeof ev.by === "string" ? ev.by : "";
  if (kind === "spawned") {
    const wid = ev.as;
    return typeof wid === "string" && wid ? [wid, true] : void 0;
  }
  if (kind === "turn_started" || kind === "turn_finished" || kind === "interrupt_requested" || kind === "interrupted") {
    const wid = ev.worker;
    return typeof wid === "string" && wid ? [wid, false] : void 0;
  }
  if (kind === "killed" || kind === "done" || kind === "error") {
    const wid = typeof ev.worker === "string" && ev.worker || typeof ev.as === "string" && ev.as || "";
    if (wid)
      return [wid, true];
    if (by.startsWith(SUPERVISOR_PREFIX))
      return [by.slice(SUPERVISOR_PREFIX.length), true];
    return by ? [by, false] : void 0;
  }
  return void 0;
}
function newWorker(wid) {
  return {
    id: wid,
    lifecycle: "starting",
    activity: "idle",
    terminal: false,
    consumedInputSeq: -1,
    inboxPolicy: "explicitOnly",
    pendingMessageCount: 0
  };
}
function reduceWorkerRegistry(events, channel) {
  const workers = /* @__PURE__ */ new Map();
  for (const ev of events) {
    const ident = identifyWorker(ev);
    if (ident === void 0)
      continue;
    const [wid, canCreate] = ident;
    if (!workers.has(wid)) {
      if (!canCreate)
        continue;
      workers.set(wid, newWorker(wid));
    }
    const w = workers.get(wid);
    const kind = ev.kind;
    const by = typeof ev.by === "string" ? ev.by : "";
    const ts = typeof ev.ts === "string" ? ev.ts : void 0;
    if (kind === "spawned") {
      w.lifecycle = "running";
      w.terminal = false;
      w.activity = "idle";
      w.activeTurnId = null;
      delete w.exitCode;
      delete w.exitSignal;
      delete w.reason;
      delete w.error;
      w.spawnedAt = ts;
      w.idleSince = ts;
      w.startedBy = by;
      w.provider = ev.provider;
      w.agent = ev.agent;
      w.inboxPolicy = (typeof ev.inboxPolicy === "string" ? ev.inboxPolicy : void 0) ?? "explicitOnly";
    } else if (kind === "turn_started") {
      w.activity = "mid-turn";
      w.activeTurnId = typeof ev.turnId === "string" ? ev.turnId : null;
      w.activeTurnStartedAt = ts;
      delete w.idleSince;
      const iseq = ev.inputSeq;
      if (typeof iseq === "number" && Number.isInteger(iseq)) {
        w.consumedInputSeq = Math.max(w.consumedInputSeq, iseq);
      }
    } else if (kind === "turn_finished" || kind === "interrupted") {
      w.activity = "idle";
      w.activeTurnId = null;
      w.idleSince = ts;
    } else if (kind === "interrupt_requested") {
    } else if (kind === "done") {
      w.activeTurnId = null;
      if (ev.synthesized === true) {
        w.terminal = true;
        w.lifecycle = "done";
        w.exitCode = ev.exit_code;
        delete w.idleSince;
      } else {
        w.idleSince = ts;
        w.activity = "idle";
      }
    } else if (kind === "error") {
      w.error = ev.message;
      const isSup = by.startsWith(SUPERVISOR_PREFIX);
      if (ev.synthesized === true || isSup) {
        w.terminal = true;
        w.lifecycle = "error";
        w.exitCode = ev.exit_code;
        w.exitSignal = ev.exit_signal;
        delete w.idleSince;
      } else {
        w.idleSince = ts;
        w.activity = "idle";
      }
    } else if (kind === "killed") {
      w.lifecycle = ev.reason === "crash" ? "crashed" : "killed";
      w.terminal = true;
      w.activity = "idle";
      w.activeTurnId = null;
      delete w.idleSince;
      w.reason = ev.reason;
      w.signal = ev.signal;
    }
    w.updatedAt = ts;
    w.lastSeq = typeof ev.seq === "number" ? ev.seq : w.lastSeq;
  }
  for (const w of workers.values()) {
    if (w.terminal) {
      w.pendingMessageCount = 0;
      continue;
    }
    let cnt = 0;
    for (const ev of events) {
      const seq2 = ev.seq;
      if (typeof seq2 !== "number" || seq2 <= w.consumedInputSeq)
        continue;
      if (matchesInboxPolicy(ev, w.id, w.inboxPolicy))
        cnt += 1;
    }
    w.pendingMessageCount = cnt;
  }
  const out = [];
  for (const wid of [...workers.keys()].sort()) {
    const { consumedInputSeq: _drop, ...rest } = workers.get(wid);
    const w = { ...rest };
    if (channel)
      w.channel = channel;
    out.push(w);
  }
  return { workers: out };
}

// packages/kernel/dist/channel/thread-state.js
var THREAD_KEY_RE = /^[A-Za-z0-9._-]+$/;
function normalizeThreadKey(v) {
  const trimmed = (v ?? "").trim();
  if (!trimmed)
    throw new Error("Thread key must not be empty");
  if (!THREAD_KEY_RE.test(trimmed)) {
    throw new Error("Thread key may only contain letters, numbers, '.', '_' and '-'");
  }
  return trimmed;
}
function asStringArray(value) {
  if (!Array.isArray(value))
    return void 0;
  return value.filter((x) => typeof x === "string");
}
function asContextEntries(value) {
  if (!Array.isArray(value))
    return void 0;
  const out = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object")
      continue;
    const e = entry;
    if (e.type === "file" && typeof e.path === "string")
      out.push(e);
    else if (e.type === "raw" && typeof e.text === "string")
      out.push(e);
    else if (typeof e.file === "string")
      out.push(e);
    else if (typeof e.raw === "string")
      out.push(e);
  }
  return out.length > 0 ? out : void 0;
}
function contextEntryKey(entry) {
  if (entry.type === "file")
    return `file:${entry.path}`;
  if (entry.type === "raw")
    return `raw:${entry.text}`;
  if (typeof entry.file === "string")
    return `file:${entry.file}`;
  return `raw:${entry.raw}`;
}
function isThreadEvent(ev) {
  return ev.kind === "thread";
}
function isThreadContextEvent(ev) {
  return ev.kind === "context" && ev.target === "thread" && Boolean(ev.thread);
}
function buildThreadAliasResolver(events) {
  const aliasToCurrent = /* @__PURE__ */ new Map();
  const aliasesByCurrent = /* @__PURE__ */ new Map();
  const currentFor = (key) => {
    let cur = aliasToCurrent.get(key) ?? key;
    const seen = /* @__PURE__ */ new Set();
    while (aliasToCurrent.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = aliasToCurrent.get(cur);
    }
    return cur;
  };
  for (const ev of events) {
    if (!isThreadEvent(ev) || ev.action !== "rename")
      continue;
    const newRaw = ev.newThread;
    const newKey = typeof newRaw === "string" ? newRaw.trim() : void 0;
    const oldKey = typeof ev.thread === "string" ? ev.thread : void 0;
    if (!newKey || !oldKey || newKey === oldKey)
      continue;
    const oldCurrent = currentFor(oldKey);
    const targetCurrent = currentFor(newKey);
    if (oldCurrent === targetCurrent)
      continue;
    const moving = aliasesByCurrent.get(oldCurrent) ?? /* @__PURE__ */ new Set();
    moving.add(oldCurrent);
    aliasesByCurrent.delete(oldCurrent);
    const target = aliasesByCurrent.get(targetCurrent) ?? /* @__PURE__ */ new Set();
    for (const alias of moving) {
      if (alias !== targetCurrent)
        target.add(alias);
      aliasToCurrent.set(alias, targetCurrent);
    }
    aliasesByCurrent.set(targetCurrent, target);
  }
  return {
    resolve(key) {
      let cur = aliasToCurrent.get(key) ?? key;
      const seen = /* @__PURE__ */ new Set();
      while (aliasToCurrent.has(cur) && !seen.has(cur)) {
        seen.add(cur);
        cur = aliasToCurrent.get(cur);
      }
      return cur;
    },
    aliasesFor(currentKey) {
      const s = aliasesByCurrent.get(currentKey);
      return s ? [...s] : [];
    }
  };
}
function newState(key, seq2) {
  return {
    thread: key,
    status: "open",
    labels: [],
    assignees: [],
    lastSeq: seq2,
    comments: 0,
    aliases: [],
    contextMap: /* @__PURE__ */ new Map()
  };
}
function applyThreadAction(state, ev) {
  const action = ev.action;
  if (action === "opened") {
    state.status = typeof ev.status === "string" ? ev.status : "open";
    if (typeof ev.title === "string")
      state.title = ev.title;
    if (typeof ev.description === "string")
      state.description = ev.description;
    const initial = asContextEntries(ev.context) ?? asContextEntries(ev.linkedContext);
    if (initial) {
      state.contextMap = /* @__PURE__ */ new Map();
      for (const entry of initial)
        state.contextMap.set(contextEntryKey(entry), entry);
    }
    state.labels = asStringArray(ev.labels) ?? state.labels;
    state.assignees = asStringArray(ev.assignees) ?? state.assignees;
  } else if (action === "comment") {
    state.comments += 1;
  } else if (action === "status") {
    if (typeof ev.status === "string")
      state.status = ev.status;
  } else if (action === "labels") {
    state.labels = asStringArray(ev.labels) ?? state.labels;
  } else if (action === "assignees") {
    state.assignees = asStringArray(ev.assignees) ?? state.assignees;
  } else if (action === "summary") {
    if (typeof ev.summary === "string")
      state.summary = ev.summary;
  } else if (action === "processed") {
    state.status = typeof ev.status === "string" ? ev.status : "processed";
  }
}
function reduceThreads(events) {
  const resolver = buildThreadAliasResolver(events);
  const states = /* @__PURE__ */ new Map();
  const ensure = (key, seq2) => {
    if (!states.has(key))
      states.set(key, newState(key, seq2));
    return states.get(key);
  };
  for (const ev of events) {
    const seq2 = typeof ev.seq === "number" ? ev.seq : 0;
    if (isThreadEvent(ev)) {
      const current = resolver.resolve(ev.thread);
      const state = ensure(current, seq2);
      const ts = ev.ts;
      if (typeof ts === "string") {
        state.updatedAt = ts;
        if (state.openedAt === void 0)
          state.openedAt = ts;
      }
      state.lastSeq = seq2;
      applyThreadAction(state, ev);
      continue;
    }
    if (isThreadContextEvent(ev)) {
      const current = resolver.resolve(ev.thread);
      const state = states.get(current);
      if (state === void 0)
        continue;
      const entries = asContextEntries(ev.context);
      if (!entries)
        continue;
      if (ev.action === "add") {
        for (const entry of entries)
          state.contextMap.set(contextEntryKey(entry), entry);
      } else if (ev.action === "delete") {
        for (const entry of entries)
          state.contextMap.delete(contextEntryKey(entry));
      }
      const ts = ev.ts;
      if (typeof ts === "string")
        state.updatedAt = ts;
      state.lastSeq = seq2;
    }
  }
  const out = [];
  for (const [currentKey, accum] of states) {
    const { contextMap, ...rest } = accum;
    const state = { ...rest };
    state.aliases = resolver.aliasesFor(currentKey);
    if (contextMap.size > 0)
      state.context = [...contextMap.values()];
    out.push(state);
  }
  out.sort((a, b) => {
    const av = a.updatedAt ?? "";
    const bv = b.updatedAt ?? "";
    return av < bv ? 1 : av > bv ? -1 : 0;
  });
  return out;
}
function formatThreadBoard(states) {
  if (states.length === 0)
    return "(no threads)";
  const lines = [];
  for (const s of states) {
    const title = s.title ?? "";
    let head = `[${s.status}] ${s.thread}`;
    if (title)
      head += ` \u2014 ${title}`;
    const meta = [];
    if (s.comments)
      meta.push(`${s.comments} comments`);
    if (s.labels.length)
      meta.push("labels: " + s.labels.join(","));
    if (s.assignees.length)
      meta.push("assignees: " + s.assignees.join(","));
    if (meta.length)
      head += "  (" + meta.join("; ") + ")";
    lines.push(head);
  }
  return lines.join("\n");
}

// packages/kernel/dist/channel/turns.js
var TurnTracker = class {
  turns = [];
  onIdleExit;
  onIdleEnter;
  constructor(onIdleExit, onIdleEnter) {
    this.onIdleExit = onIdleExit;
    this.onIdleEnter = onIdleEnter;
  }
  begin(inputSeq) {
    const wasIdle = this.turns.length === 0;
    const turn = { inputSeq, turnId: `msg:${inputSeq}` };
    this.turns.push(turn);
    if (wasIdle)
      this.onIdleExit?.();
    return turn;
  }
  finish() {
    const turn = this.turns.pop();
    if (turn !== void 0 && this.turns.length === 0)
      this.onIdleEnter?.();
    return turn;
  }
  abortCurrent() {
    const turn = this.turns.pop();
    if (turn !== void 0 && this.turns.length === 0)
      this.onIdleEnter?.();
    return turn;
  }
  current() {
    return this.turns.length > 0 ? this.turns[this.turns.length - 1] : void 0;
  }
};

// packages/kernel/dist/channel/guard.js
var TERMINAL_LIFECYCLES = /* @__PURE__ */ new Set(["done", "error", "killed", "crashed"]);
function parseIsoMs(s) {
  if (!s || typeof s !== "string")
    return void 0;
  const t = Date.parse(s);
  return Number.isNaN(t) ? void 0 : t;
}
function isIdleCleanupEligible(live, idleTimeoutMs, nowMs) {
  if (idleTimeoutMs <= 0)
    return false;
  const st = live.state ?? {};
  if (st.activity !== "idle")
    return false;
  if (!st.idleSince)
    return false;
  if (st.terminal)
    return false;
  const idleSince = parseIsoMs(st.idleSince);
  if (idleSince === void 0)
    return false;
  return nowMs - idleSince >= idleTimeoutMs;
}
function spawnBudgetVerdict(liveCount, maxLiveWorkers) {
  return { allowed: maxLiveWorkers <= 0 || liveCount < maxLiveWorkers };
}
function formatBudgetOverflowError(projectKey2, live, limit) {
  const header = `Live worker budget exhausted for project '${projectKey2}': ${live.length}/${limit} live worker(s).`;
  const rows = live.map((w) => `  \u2022 channel='${w.channel}' worker='${w.workerId}' provider=${w.provider ?? "?"} lifecycle=${w.lifecycle ?? "?"} activity=${w.activity ?? "?"} pid=${w.supervisorPid ?? "?"}` + (w.supervisorVerified === false ? " supervisor=unverified" : "")).join("\n");
  const hint = [
    "Free a slot before spawning, e.g.:",
    "  pipeline channel kill <channel> --as <worker>",
    "Or override per spawn:",
    `  pipeline channel spawn ... --max-live-workers ${live.length + 1}`,
    "Or raise the default in .pipeline/manifest.yaml under channel.worker_guard.max_live_workers."
  ].join("\n");
  const parts = [header];
  if (rows)
    parts.push(rows);
  parts.push(hint);
  return parts.join("\n");
}

// packages/kernel/dist/channel/fs.js
import { appendFileSync, closeSync, existsSync as existsSync3, mkdirSync, openSync, readdirSync as readdirSync2, readFileSync as readFileSync5, renameSync, rmSync, statSync as statSync2, writeFileSync, writeSync } from "node:fs";
function nodeChannelFs() {
  return {
    pid: process.pid,
    exists: (p) => existsSync3(p),
    readText: (p) => {
      try {
        return readFileSync5(p, "utf8");
      } catch {
        return void 0;
      }
    },
    writeText: (p, data) => {
      writeFileSync(p, data, "utf8");
    },
    appendText: (p, data) => {
      appendFileSync(p, data, "utf8");
    },
    mkdirp: (p) => {
      mkdirSync(p, { recursive: true, mode: 448 });
    },
    listDir: (p) => {
      try {
        return readdirSync2(p, { withFileTypes: true }).map((e) => ({
          name: e.name,
          isFile: e.isFile(),
          isDirectory: e.isDirectory()
        }));
      } catch {
        return [];
      }
    },
    rename: (src, dst) => {
      renameSync(src, dst);
    },
    remove: (p) => {
      try {
        rmSync(p, { force: true });
      } catch {
      }
    },
    mtimeMs: (p) => {
      try {
        return statSync2(p).mtimeMs;
      } catch {
        return void 0;
      }
    },
    createExclusive: (p, content) => {
      try {
        const fd = openSync(p, "wx", 384);
        try {
          writeSync(fd, content);
        } finally {
          closeSync(fd);
        }
        return true;
      } catch {
        return false;
      }
    },
    pidAlive: (pid) => {
      if (!pid)
        return false;
      try {
        process.kill(pid, 0);
        return true;
      } catch (e) {
        return e.code === "EPERM";
      }
    }
  };
}
function sleepMs(ms) {
  const sab = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(sab, 0, 0, ms);
}
var LOCK_RETRY_MS = 25;
var LOCK_TIMEOUT_MS = 5e3;
function withChannelLock(fs, lockFile, fn) {
  const holder = String(fs.pid);
  let waited = 0;
  for (; ; ) {
    if (fs.createExclusive(lockFile, holder))
      break;
    const cur = fs.readText(lockFile);
    if (cur !== void 0) {
      const pid = Number.parseInt(cur.trim(), 10);
      if (Number.isInteger(pid) && !fs.pidAlive(pid))
        fs.remove(lockFile);
    }
    if (waited >= LOCK_TIMEOUT_MS)
      throw new Error(`\u83B7\u53D6 channel \u9501\u8D85\u65F6: ${lockFile}`);
    sleepMs(LOCK_RETRY_MS);
    waited += LOCK_RETRY_MS;
  }
  try {
    return fn();
  } finally {
    const cur = fs.readText(lockFile);
    if (cur !== void 0 && cur.trim() === holder)
      fs.remove(lockFile);
  }
}

// packages/kernel/dist/channel/store.js
function defaultClock3() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
}
function createChannelStore(env, fs = nodeChannelFs(), clock = defaultClock3) {
  const ensureDir = (name2, scope) => {
    const dir = channelDir(env, name2, scope);
    fs.mkdirp(dir);
    return dir;
  };
  const read = (name2, scope) => {
    return parseEventsText(fs.readText(eventsPath(env, name2, scope)));
  };
  const reconcile = (name2, scope) => {
    const evText = fs.readText(eventsPath(env, name2, scope)) ?? "";
    const last = readLastJsonlSeqFromText(evText);
    const sidecarPath = seqPath(env, name2, scope);
    const sidecarText = fs.readText(sidecarPath);
    const sidecar = sidecarText === void 0 ? void 0 : parseSidecar(sidecarText);
    if (sidecar !== last)
      writeSidecar(fs, sidecarPath, last);
    return last;
  };
  const append = (name2, partial, scope) => {
    const kind = parseChannelKind(partial.kind);
    if (kind === void 0)
      throw new Error("append \u7F3A kind");
    if (!partial.by)
      throw new Error("append \u7F3A by");
    validateEventBase(partial);
    const dir = ensureDir(name2, scope);
    const evFile = eventsPath(env, name2, scope);
    const sidecarFile = seqPath(env, name2, scope);
    const lock = lockPath(env, name2, scope);
    return withChannelLock(fs, lock, () => {
      const evText = fs.readText(evFile) ?? "";
      const idem = partial.idempotencyKey;
      if (idem) {
        const existing = findIdempotentEvent(evText, idem, kind);
        if (existing !== void 0)
          return existing;
      }
      const last = readLastJsonlSeqFromText(evText);
      const event = { ...partial };
      event.seq = nextSeq(last);
      event.ts = typeof partial.ts === "string" && partial.ts ? partial.ts : clock();
      fs.appendText(evFile, JSON.stringify(event) + "\n");
      writeSidecar(fs, sidecarFile, event.seq);
      void dir;
      return event;
    });
  };
  const registry = (name2, scope) => {
    return reduceWorkerRegistry(read(name2, scope), name2);
  };
  const list = (opts) => {
    const scope = opts.scope ?? "project";
    const showAll = opts.all === true;
    const buckets = [];
    if (opts.allProjects) {
      for (const e of fs.listDir(env.root)) {
        if (e.isDirectory)
          buckets.push(e.name);
      }
      buckets.sort();
    } else {
      const bdir = bucketDir(env, scope);
      buckets.push(bdir.slice(env.root.length + 1));
    }
    const rows = [];
    for (const bucketName of buckets) {
      const bdir = `${env.root}/${bucketName}`;
      for (const e of fs.listDir(bdir)) {
        if (!e.isDirectory || e.name.startsWith("."))
          continue;
        const chanScope = bucketName === "_global" ? "global" : scope;
        const evs = bucketName === "_global" || !opts.allProjects ? read(e.name, chanScope) : readInDir(fs, `${bdir}/${e.name}`);
        const first = evs[0] ?? {};
        const last = evs[evs.length - 1] ?? {};
        const ephemeral = Boolean(first.ephemeral);
        if (ephemeral && !showAll)
          continue;
        let workersTotal = 0;
        let workersAlive = 0;
        for (const f of fs.listDir(`${bdir}/${e.name}`)) {
          if (!f.isFile || !f.name.endsWith(".pid"))
            continue;
          workersTotal += 1;
          const pidText = fs.readText(`${bdir}/${e.name}/${f.name}`);
          const pid = pidText === void 0 ? NaN : Number.parseInt(pidText.trim(), 10);
          if (Number.isInteger(pid) && fs.pidAlive(pid))
            workersAlive += 1;
        }
        rows.push({
          name: e.name,
          project: bucketName,
          task: first.task,
          type: typeof first.type === "string" && first.type || "chat",
          createdAt: first.ts,
          lastEventTs: last.ts,
          lastKind: last.kind,
          events: evs.length,
          ephemeral,
          workersTotal,
          workersAlive
        });
      }
    }
    rows.sort((a, b) => {
      const av = typeof a.lastEventTs === "string" ? a.lastEventTs : "";
      const bv = typeof b.lastEventTs === "string" ? b.lastEventTs : "";
      return av < bv ? 1 : av > bv ? -1 : 0;
    });
    return rows;
  };
  return {
    append: (name2, partial, scope = "project") => append(name2, partial, scope),
    read: (name2, scope = "project") => read(name2, scope),
    reconcile: (name2, scope = "project") => reconcile(name2, scope),
    channelDir: (name2, scope = "project") => channelDir(env, name2, scope),
    ensureDir: (name2, scope = "project") => ensureDir(name2, scope),
    registry: (name2, scope = "project") => registry(name2, scope),
    list: (o = {}) => list(o)
  };
}
function readInDir(fs, chanDir) {
  return parseEventsText(fs.readText(`${chanDir}/events.jsonl`));
}
function writeSidecar(fs, path6, seq2) {
  const tmp = `${path6}.tmp.${fs.pid}.${Date.now()}`;
  fs.writeText(tmp, String(seq2));
  fs.rename(tmp, path6);
}

// packages/kernel/dist/channel/process.js
import { spawn, spawnSync } from "node:child_process";
function makeLineBuffer(onLine) {
  let carry = "";
  return (chunk) => {
    carry += chunk;
    const lines = carry.split("\n");
    carry = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim())
        onLine(line);
    }
  };
}
function isSupervisorCmdline(cmd, channel, worker) {
  if (!cmd)
    return false;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ch = esc(channel);
  const wk = esc(worker);
  const pat = new RegExp(`(?:channel\\s+__supervisor|channel[./]supervisor)\\s+${ch}\\s+${wk}(?:\\s|$)`);
  return pat.test(cmd);
}
function nodeProcessFace() {
  return {
    selfPid: process.pid,
    spawn: (command, args, opts) => nodeSpawnWorker(command, args, opts),
    spawnDetached: (command, args, opts) => {
      try {
        const child = spawn(command, args, {
          cwd: opts?.cwd,
          env: mergeEnv(opts?.env),
          detached: true,
          stdio: "ignore"
        });
        const pid = child.pid;
        child.unref();
        return pid;
      } catch {
        return void 0;
      }
    },
    pidAlive: (pid) => pidAliveReal(pid),
    kill: (pid, signal = "SIGTERM") => {
      if (!pid)
        return false;
      try {
        process.kill(pid, signal);
        return true;
      } catch {
        return false;
      }
    },
    isSupervisorProcess: (pid, channel, worker) => {
      if (process.platform === "win32")
        return false;
      if (!pid)
        return false;
      try {
        const out = spawnSync("ps", ["-p", String(pid), "-o", "command="], {
          encoding: "utf8",
          timeout: 5e3
        });
        const cmd = (out.stdout ?? "").trim();
        return isSupervisorCmdline(cmd, channel, worker);
      } catch {
        return false;
      }
    }
  };
}
function pidAliveReal(pid) {
  if (!pid)
    return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}
function mergeEnv(extra) {
  if (!extra)
    return process.env;
  const out = { ...process.env };
  for (const [k, v] of Object.entries(extra)) {
    if (v === void 0)
      delete out[k];
    else
      out[k] = v;
  }
  return out;
}
function nodeSpawnWorker(command, args, opts) {
  const spawnOpts = {
    cwd: opts?.cwd,
    env: mergeEnv(opts?.env),
    stdio: ["pipe", "pipe", "pipe"]
  };
  const child = spawn(command, args, spawnOpts);
  let exitedFlag = false;
  child.on("exit", () => {
    exitedFlag = true;
  });
  if (child.stdout)
    child.stdout.setEncoding("utf8");
  if (child.stderr)
    child.stderr.setEncoding("utf8");
  return {
    get pid() {
      return child.pid;
    },
    write: (data) => {
      try {
        child.stdin?.write(data);
      } catch {
      }
    },
    closeStdin: () => {
      try {
        child.stdin?.end();
      } catch {
      }
    },
    onStdoutLine: (cb) => {
      const feed = makeLineBuffer(cb);
      child.stdout?.on("data", (chunk) => feed(chunk));
    },
    onStderr: (cb) => {
      child.stderr?.on("data", (chunk) => cb(chunk));
    },
    onSpawn: (cb) => {
      child.on("spawn", cb);
    },
    onError: (cb) => {
      child.on("error", cb);
    },
    onExit: (cb) => {
      child.on("exit", (code, signal) => cb(code, signal));
    },
    exited: () => exitedFlag,
    kill: (signal = "SIGTERM") => {
      try {
        return child.kill(signal);
      } catch {
        return false;
      }
    }
  };
}

// packages/kernel/dist/channel/watcher.js
import { closeSync as closeSync2, openSync as openSync2, readSync, statSync as statSync3 } from "node:fs";
function nodeTailFs() {
  return {
    size: (p) => {
      try {
        return statSync3(p).size;
      } catch {
        return void 0;
      }
    },
    readSlice: (p, start, length) => {
      if (length <= 0)
        return "";
      let fd;
      try {
        fd = openSync2(p, "r");
        const buf = Buffer.allocUnsafe(length);
        const n = readSync(fd, buf, 0, length, start);
        return buf.toString("utf8", 0, n);
      } catch {
        return void 0;
      } finally {
        if (fd !== void 0) {
          try {
            closeSync2(fd);
          } catch {
          }
        }
      }
    }
  };
}
function initialOffset(fs, path6, mode) {
  if (mode.fromStart || mode.sinceSeq !== void 0)
    return 0;
  return fs.size(path6) ?? 0;
}
function readNewEvents(fs, path6, state) {
  const size = fs.size(path6);
  if (size === void 0) {
    state.byteOffset = 0;
    state.carry = "";
    return [];
  }
  if (size < state.byteOffset) {
    state.byteOffset = 0;
    state.carry = "";
  }
  if (size <= state.byteOffset)
    return [];
  const chunk = fs.readSlice(path6, state.byteOffset, size - state.byteOffset);
  if (chunk === void 0)
    return [];
  state.byteOffset = size;
  const text = state.carry + chunk;
  const lines = text.split("\n");
  state.carry = lines.pop() ?? "";
  return parseEventsText(lines.join("\n"));
}
function defaultSleep(ms) {
  return new Promise((resolve10) => {
    const t = setTimeout(resolve10, ms);
    if (typeof t.unref === "function")
      t.unref();
  });
}
async function* tailEvents(fs, path6, opts = {}) {
  const pollMs = opts.pollMs ?? 200;
  const sleep3 = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const state = {
    byteOffset: initialOffset(fs, path6, opts),
    carry: ""
  };
  let yielded = 0;
  const started = now();
  for (; ; ) {
    if (opts.aborted?.())
      return;
    for (const ev of readNewEvents(fs, path6, state)) {
      if (opts.sinceSeq !== void 0) {
        const seq2 = ev.seq;
        if (typeof seq2 === "number" && seq2 <= opts.sinceSeq)
          continue;
      }
      if (opts.filter !== void 0 && !opts.filter(ev))
        continue;
      yield ev;
      yielded += 1;
      if (opts.maxEvents !== void 0 && yielded >= opts.maxEvents)
        return;
    }
    if (opts.timeoutMs !== void 0 && now() - started >= opts.timeoutMs)
      return;
    if (opts.aborted?.())
      return;
    await sleep3(pollMs);
  }
}

// packages/kernel/dist/channel/liveness.js
function readPid(fs, path6) {
  const raw = fs.readText(path6);
  if (raw === void 0)
    return void 0;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isInteger(n) ? n : void 0;
}
function readReservationWorkers(fs, dir) {
  const out = [];
  const entries = fs.listDir(dir);
  const names = entries.filter((e) => e.isFile && e.name.endsWith(".reservation")).map((e) => e.name).sort();
  for (const name2 of names) {
    const wid = name2.slice(0, -".reservation".length);
    if (!wid)
      continue;
    out.push({
      id: wid,
      state: {
        id: wid,
        lifecycle: "starting",
        activity: "idle",
        terminal: false,
        inboxPolicy: "explicitOnly",
        pendingMessageCount: 0
      }
    });
  }
  return out;
}
function scanLiveWorkers(deps, scope = "project") {
  const { env, fs, proc } = deps;
  const bucket = bucketDir(env, scope);
  const out = [];
  const entries = fs.listDir(bucket);
  const channels = entries.filter((e) => e.isDirectory && !e.name.startsWith(".")).map((e) => e.name).sort();
  for (const channel of channels) {
    const dir = channelDir(env, channel, scope);
    const seen = /* @__PURE__ */ new Set();
    const evText = fs.readText(eventsPath(env, channel, scope));
    const workers = reduceWorkerRegistry(parseEventsText(evText)).workers;
    for (const st of workers) {
      if (st.terminal || TERMINAL_LIFECYCLES.has(st.lifecycle))
        continue;
      const supPid = readPid(fs, workerFile(env, channel, st.id, "pid", scope));
      if (supPid === void 0 || !proc.pidAlive(supPid))
        continue;
      const verified = proc.isSupervisorProcess(supPid, channel, st.id);
      const rec = { channel, workerId: st.id, state: st, supervisorPid: supPid, supervisorVerified: verified };
      const wp = readPid(fs, workerFile(env, channel, st.id, "worker-pid", scope));
      if (wp !== void 0)
        rec.workerPid = wp;
      out.push(rec);
      seen.add(st.id);
    }
    for (const rsv of readReservationWorkers(fs, dir)) {
      if (seen.has(rsv.id))
        continue;
      const supPid = readPid(fs, workerFile(env, channel, rsv.id, "pid", scope));
      if (supPid === void 0 || !proc.pidAlive(supPid))
        continue;
      out.push({
        channel,
        workerId: rsv.id,
        state: rsv.state,
        supervisorPid: supPid,
        supervisorVerified: proc.isSupervisorProcess(supPid, channel, rsv.id)
      });
    }
  }
  return out;
}
function cleanupExpiredIdleWorkers(deps, candidates, idleTimeoutMs, nowMs, scope = "project") {
  const { env, fs, proc } = deps;
  const result = { killed: [], failed: [] };
  if (idleTimeoutMs <= 0)
    return result;
  for (const live of candidates) {
    if (!isIdleCleanupEligible(live, idleTimeoutMs, nowMs))
      continue;
    try {
      const supPid = live.supervisorPid;
      if (supPid === void 0 || live.supervisorVerified !== true || !proc.pidAlive(supPid))
        continue;
      const reasonFile = workerFile(env, live.channel, live.workerId, "shutdown-reason", scope);
      fs.writeText(reasonFile, "idle-timeout\n");
      const sent = proc.kill(supPid, "SIGTERM");
      if (!sent) {
        fs.remove(reasonFile);
        result.failed.push({ worker: live, error: "SIGTERM failed" });
        continue;
      }
      result.killed.push(live);
    } catch (e) {
      result.failed.push({ worker: live, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}
function enforceSpawnBudget(deps, policy, nowMs, scope = "project") {
  const initial = scanLiveWorkers(deps, scope);
  const cleanup2 = cleanupExpiredIdleWorkers(deps, initial, policy.idleTimeoutMs, nowMs, scope);
  const killedIds = new Set(cleanup2.killed.map((w) => `${w.channel}::${w.workerId}`));
  const rescan = scanLiveWorkers(deps, scope);
  const remaining = rescan.filter((w) => !killedIds.has(`${w.channel}::${w.workerId}`));
  const allowed = spawnBudgetVerdict(remaining.length, policy.maxLiveWorkers).allowed;
  return { cleaned: cleanup2.killed, remaining, allowed };
}
function toOverflowFacts(live) {
  return live.map((w) => ({
    channel: w.channel,
    workerId: w.workerId,
    provider: w.state.provider,
    lifecycle: w.state.lifecycle,
    activity: w.state.activity,
    supervisorPid: w.supervisorPid,
    supervisorVerified: w.supervisorVerified
  }));
}
function hasLiveWorker(fs, proc, dir) {
  for (const e of fs.listDir(dir)) {
    if (!e.isFile || !e.name.endsWith(".pid"))
      continue;
    const pid = readPid(fs, `${dir}/${e.name}`);
    if (pid !== void 0 && proc.pidAlive(pid))
      return true;
  }
  return false;
}

// packages/kernel/dist/channel/supervisor.js
var SHUTDOWN_GRACE_MS = 3e3;
var DEFAULT_INBOX_POLICY = "explicitOnly";
var EchoAdapter = class {
  provider = "cat";
  createCtx() {
    return { ready: true };
  }
  buildArgs() {
    return ["-u"];
  }
  isReady() {
    return true;
  }
  encodeUserMessage(text) {
    return text + "\n";
  }
  encodeInterruptMessage(text) {
    return text + "\n";
  }
  parseLine(line) {
    return { events: [{ kind: "done", payload: { text: line.trim() } }], side: null };
  }
};
var defaultScheduler = (fn, ms) => {
  const t = setTimeout(fn, ms);
  if (typeof t.unref === "function")
    t.unref();
  return () => clearTimeout(t);
};
var ShutdownController = class {
  deps;
  reason;
  signal;
  terminalEmitted = false;
  killedStarted = false;
  killedDone = false;
  killedWaiters = [];
  ladderCancels = [];
  schedule;
  graceMs;
  log;
  constructor(deps) {
    this.deps = deps;
    this.schedule = deps.schedule ?? defaultScheduler;
    this.graceMs = deps.graceMs ?? SHUTDOWN_GRACE_MS;
    this.log = deps.log ?? (() => {
    });
  }
  isShuttingDown() {
    return this.reason !== void 0;
  }
  markTerminalEmitted() {
    this.terminalEmitted = true;
  }
  hasTerminalEvent() {
    return this.terminalEmitted;
  }
  /** 首占返 true；已占返 false（幂等首调用胜，shutdown.py:72）。 */
  claim(reason) {
    if (this.reason !== void 0)
      return false;
    this.reason = reason;
    return true;
  }
  settleKilled() {
    this.killedDone = true;
    const waiters = this.killedWaiters.splice(0);
    for (const w of waiters)
      w();
  }
  awaitKilled() {
    if (this.killedDone || !this.killedStarted)
      return Promise.resolve();
    return new Promise((resolve10) => this.killedWaiters.push(resolve10));
  }
  // kill ladder：close stdin → grace → SIGTERM → grace → SIGKILL（shutdown.py:93）。
  startKillLadder() {
    const child = this.deps.child();
    child.closeStdin();
    const step3 = () => {
      if (!child.exited()) {
        this.log("[supervisor] still alive, SIGKILL worker\n");
        child.kill("SIGKILL");
      }
    };
    const step2 = () => {
      if (!child.exited()) {
        this.log("[supervisor] grace expired, SIGTERM worker\n");
        child.kill("SIGTERM");
        this.ladderCancels.push(this.schedule(step3, this.graceMs));
      }
    };
    this.ladderCancels.push(this.schedule(step2, this.graceMs));
  }
  writeKilled(reason, signal) {
    const partial = { kind: "killed", by: `supervisor:${this.deps.worker}`, reason, signal };
    if (reason === "timeout" && this.deps.timeoutMs)
      partial.timeout_ms = this.deps.timeoutMs;
    if (reason === "idle-timeout" && this.deps.idleTimeoutMs)
      partial.idle_timeout_ms = this.deps.idleTimeoutMs;
    try {
      this.deps.append(partial);
    } finally {
      this.settleKilled();
    }
  }
  /** 幂等漏斗：起 kill ladder + 写 killed（一次性，shutdown.py:142）。 */
  async request(signalName, reason) {
    let already;
    if (this.killedStarted) {
      already = true;
    } else {
      already = false;
      this.killedStarted = true;
      if (this.reason === void 0)
        this.reason = reason;
      if (this.signal === void 0)
        this.signal = signalName;
    }
    if (already) {
      await this.awaitKilled();
      return;
    }
    this.log(`[supervisor] shutting down worker (reason=${this.reason}, signal=${this.signal})
`);
    this.startKillLadder();
    this.writeKilled(this.reason, this.signal);
  }
  /** child exit 时调：冷退出合成 fallback + 等在途 killed 落地（shutdown.py:164）。 */
  async finalizeOnExit(code, signalObj) {
    this.log(`[supervisor] worker exit code=${code ?? "null"} signal=${signalObj ?? "null"}
`);
    let synth = false;
    if (!this.terminalEmitted && this.reason === void 0) {
      this.terminalEmitted = true;
      synth = true;
    }
    if (synth) {
      if (code === 0) {
        this.deps.append({ kind: "done", by: this.deps.worker, synthesized: true, exit_code: code });
      } else {
        this.deps.append({
          kind: "error",
          by: this.deps.worker,
          message: `worker exited without terminal event (code=${code}, signal=${signalObj})`,
          synthesized: true,
          exit_code: code,
          exit_signal: signalObj
        });
      }
    }
    if (this.killedStarted)
      await this.awaitKilled();
  }
  /** supervisor 收尾：取消在途 ladder timer（防泄漏）。 */
  dispose() {
    for (const c of this.ladderCancels.splice(0))
      c();
  }
};
var IdleTimer = class {
  idleTimeoutMs;
  shutdown;
  isChildExited;
  schedule;
  cancel;
  cancelled = false;
  constructor(idleTimeoutMs, shutdown, isChildExited, schedule = defaultScheduler) {
    this.idleTimeoutMs = idleTimeoutMs;
    this.shutdown = shutdown;
    this.isChildExited = isChildExited;
    this.schedule = schedule;
    if (idleTimeoutMs > 0)
      this.reset();
  }
  clear() {
    if (this.cancel) {
      this.cancel();
      this.cancel = void 0;
    }
  }
  fire() {
    this.cancel = void 0;
    if (this.cancelled)
      return;
    if (this.shutdown.isShuttingDown() || this.shutdown.hasTerminalEvent() || this.isChildExited())
      return;
    void this.shutdown.request("SIGTERM", "idle-timeout");
  }
  reset() {
    if (this.cancelled || this.idleTimeoutMs <= 0)
      return;
    this.clear();
    this.cancel = this.schedule(() => this.fire(), this.idleTimeoutMs);
  }
  pause() {
    this.clear();
  }
  dispose() {
    this.cancelled = true;
    this.clear();
  }
};
function applyParseResult(worker, result, child, shutdown, append, persist, turnTracker) {
  for (const ev of result.events ?? []) {
    const kind = ev.kind;
    if (kind === "done" || kind === "error")
      shutdown.markTerminalEmitted();
    append({ kind, by: worker, ...ev.payload ?? {} });
    if (kind === "done" || kind === "error") {
      const turn = turnTracker?.finish();
      if (turn) {
        append({
          kind: "turn_finished",
          by: worker,
          worker,
          inputSeq: turn.inputSeq,
          turnId: turn.turnId,
          outcome: kind === "done" ? "done" : "error"
        });
      }
    }
  }
  const side = result.side;
  if (side) {
    if (side.persistSessionId)
      persist("session-id", side.persistSessionId);
    if (side.persistThreadId)
      persist("thread-id", side.persistThreadId);
    if (side.reply) {
      for (const r of side.reply) {
        try {
          child.write(r);
        } catch {
        }
      }
    }
  }
}
function inboxEventEligible(ev, worker, policy) {
  if (ev.by === worker)
    return false;
  if (ev.kind === "message")
    return matchesInboxPolicy(ev, worker, policy);
  if (ev.kind === "interrupt_requested")
    return ev.worker === worker;
  return false;
}
var CLEANUP_SUFFIXES = ["pid", "worker-pid", "config", "spawnlock", "shutdown-reason", "reservation"];
function sleepReal(ms) {
  return new Promise((r) => {
    const t = setTimeout(r, ms);
    if (typeof t.unref === "function")
      t.unref();
  });
}
async function startSupervisor(channelName, workerName, config, deps) {
  const scope = deps.scope ?? "project";
  const { store: store2, proc, fs, env } = deps;
  const log = deps.log ?? (() => {
  });
  const schedule = deps.schedule ?? defaultScheduler;
  const tailFs = deps.tailFs ?? nodeTailFs();
  const pollMs = deps.pollMs ?? 25;
  const sleep3 = deps.sleep ?? sleepReal;
  const append = (partial) => store2.append(channelName, partial, scope);
  const wfile = (worker, suffix) => workerFile(env, channelName, worker, suffix, scope);
  const persist = (suffix, value) => fs.writeText(wfile(workerName, suffix), value);
  store2.ensureDir(channelName, scope);
  fs.writeText(wfile(workerName, "pid"), String(proc.selfPid));
  const adapter = deps.resolveAdapter(config.provider);
  const ctx = adapter.createCtx();
  const view = { resume: config.resume, model: config.model, systemPrompt: config.systemPrompt, cwd: config.cwd };
  const args = adapter.buildArgs(view);
  const childEnv = { ...config.env ?? {} };
  childEnv.TRELLIS_HOOKS = "0";
  childEnv.TRELLIS_CHANNEL = channelName;
  childEnv.TRELLIS_CHANNEL_AS = workerName;
  log(`[supervisor] starting ${adapter.provider} ${args.join(" ")}
`);
  const child = proc.spawn(adapter.provider, args, { cwd: config.cwd, env: childEnv });
  const settled = new Promise((resolve10) => {
    child.onSpawn(() => resolve10(true));
    child.onError((err) => {
      log(`[supervisor] worker error: ${err.message}
`);
      resolve10(false);
    });
  });
  child.onStderr((chunk) => log(chunk));
  const shutdown = new ShutdownController({
    worker: workerName,
    append: (p) => void append(p),
    child: () => child,
    timeoutMs: config.timeoutMs,
    idleTimeoutMs: config.idleTimeoutMs,
    schedule,
    log
  });
  const abort = { aborted: false };
  let idleTimer;
  let doneResolve;
  const done = new Promise((r) => doneResolve = r);
  child.onExit((code, signal) => {
    void (async () => {
      await shutdown.finalizeOnExit(code, signal);
      abort.aborted = true;
      idleTimer?.dispose();
    })();
  });
  const ok = await settled;
  if (!ok) {
    try {
      append({ kind: "error", by: `supervisor:${workerName}`, message: "worker spawn failed", provider: config.provider });
    } catch {
    }
    cleanup(fs, wfile, workerName);
    doneResolve(1);
    return { channel: channelName, worker: workerName, workerPid: void 0, spawned: false, done, shutdown: async () => {
    } };
  }
  if (shutdown.isShuttingDown()) {
    doneResolve(0);
    return { channel: channelName, worker: workerName, workerPid: child.pid, spawned: false, done, shutdown: (s, r) => shutdown.request(s, r) };
  }
  if (child.pid !== void 0)
    fs.writeText(wfile(workerName, "worker-pid"), String(child.pid));
  const spawnedPartial = {
    kind: "spawned",
    by: config.spawnedBy || "main",
    as: workerName,
    provider: config.provider,
    inboxPolicy: config.inboxPolicy || DEFAULT_INBOX_POLICY
  };
  if (child.pid !== void 0)
    spawnedPartial.pid = child.pid;
  if (config.agent)
    spawnedPartial.agent = config.agent;
  if (config.contextFiles)
    spawnedPartial.files = config.contextFiles;
  if (config.contextManifests)
    spawnedPartial.manifests = config.contextManifests;
  append(spawnedPartial);
  idleTimer = new IdleTimer(config.idleTimeoutMs ?? 0, shutdown, () => child.exited(), schedule);
  const turnTracker = new TurnTracker(() => idleTimer.pause(), () => idleTimer.reset());
  child.onStdoutLine((line) => {
    log(line.endsWith("\n") ? line : line + "\n");
    let result;
    try {
      result = adapter.parseLine(line, ctx);
    } catch (e) {
      log(`[supervisor] stdout line handler failed: ${e instanceof Error ? e.message : String(e)}
`);
      try {
        append({ kind: "error", by: `supervisor:${workerName}`, message: `stdout pipeline error: ${e instanceof Error ? e.message : String(e)}` });
      } catch {
      }
      return;
    }
    applyParseResult(workerName, result, child, shutdown, (p) => void append(p), persist, turnTracker);
  });
  void runInboxWatcher({
    channelName,
    workerName,
    adapter,
    ctx,
    child,
    abort,
    inboxPolicy: config.inboxPolicy || DEFAULT_INBOX_POLICY,
    turnTracker,
    scope,
    env,
    fs,
    tailFs,
    append: (p) => void append(p),
    pollMs,
    sleep: sleep3
  });
  if (typeof adapter.handshake === "function") {
    try {
      adapter.handshake(child, ctx, view);
    } catch (err) {
      log(`[supervisor] adapter handshake failed: ${err instanceof Error ? err.message : String(err)}
`);
      try {
        append({ kind: "error", by: `supervisor:${workerName}`, message: `handshake failed: ${err instanceof Error ? err.message : String(err)}`, detail: { source: "handshake" } });
      } catch {
      }
      void shutdown.request("SIGTERM", "crash");
    }
  }
  child.onExit(() => {
    void (async () => {
      await sleep3(0);
      idleTimer?.dispose();
      shutdown.dispose();
      cleanup(fs, wfile, workerName);
      doneResolve(0);
    })();
  });
  return {
    channel: channelName,
    worker: workerName,
    workerPid: child.pid,
    spawned: true,
    done,
    shutdown: (s, r) => shutdown.request(s, r)
  };
}
function cleanup(fs, wfile, worker) {
  for (const suffix of CLEANUP_SUFFIXES) {
    try {
      fs.remove(wfile(worker, suffix));
    } catch {
    }
  }
}
var READY_DEADLINE_MS = 6e4;
function readInboxCursor(fs, env, channel, worker, scope) {
  const raw = fs.readText(workerFile(env, channel, worker, "inbox-cursor", scope));
  if (raw === void 0)
    return 0;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isInteger(n) && n > 0 ? n : 0;
}
function writeInboxCursor(fs, env, channel, worker, seq2, scope) {
  try {
    fs.writeText(workerFile(env, channel, worker, "inbox-cursor", scope), String(seq2));
  } catch {
  }
}
async function runInboxWatcher(a) {
  const { channelName: channel, workerName: worker, adapter, ctx, child, abort, inboxPolicy, turnTracker, scope, env, fs, tailFs, append, pollMs, sleep: sleep3 } = a;
  let cursor = readInboxCursor(fs, env, channel, worker, scope);
  const path6 = eventsPath(env, channel, scope);
  const stream = tailEvents(tailFs, path6, {
    fromStart: cursor === 0,
    sinceSeq: cursor > 0 ? cursor : void 0,
    pollMs,
    aborted: () => abort.aborted,
    sleep: sleep3,
    filter: (ev) => inboxEventEligible(ev, worker, inboxPolicy)
  });
  for await (const ev of stream) {
    if (abort.aborted)
      return;
    const kind = ev.kind;
    const isInterrupt = kind === "interrupt_requested";
    const text = String(ev.text ?? "").trim();
    const interruptText = String(ev.message ?? "").trim();
    if (!text && (!isInterrupt || !interruptText))
      continue;
    const seq2 = typeof ev.seq === "number" ? ev.seq : cursor;
    if (!adapter.isReady(ctx)) {
      const deadline = Date.now() + READY_DEADLINE_MS;
      while (!adapter.isReady(ctx) && Date.now() < deadline && !abort.aborted)
        await sleep3(pollMs);
      if (!adapter.isReady(ctx)) {
        cursor = seq2;
        writeInboxCursor(fs, env, channel, worker, cursor, scope);
        continue;
      }
    }
    if (!isInterrupt) {
      while (turnTracker.current() && !abort.aborted)
        await sleep3(pollMs);
      if (abort.aborted)
        return;
    }
    if (isInterrupt) {
      const aborted = turnTracker.abortCurrent();
      if (aborted) {
        append({ kind: "turn_finished", by: worker, worker, inputSeq: aborted.inputSeq, turnId: aborted.turnId, outcome: "aborted" });
      }
      const interruptedPartial = {
        kind: "interrupted",
        by: worker,
        worker,
        reason: "user",
        method: "stdin",
        outcome: aborted ? "interrupted" : "no-active-turn"
      };
      if (aborted?.turnId)
        interruptedPartial.turnId = aborted.turnId;
      append(interruptedPartial);
    }
    const turn = turnTracker.begin(seq2);
    try {
      append({ kind: "turn_started", by: worker, worker, inputSeq: seq2, turnId: turn.turnId });
      const encoded = isInterrupt ? adapter.encodeInterruptMessage(interruptText, ctx) : adapter.encodeUserMessage(text, ctx);
      child.write(encoded);
      cursor = seq2;
      writeInboxCursor(fs, env, channel, worker, cursor, scope);
    } catch {
      const t = turnTracker.finish();
      if (t) {
        try {
          append({ kind: "turn_finished", by: worker, worker, inputSeq: t.inputSeq, turnId: t.turnId, outcome: "aborted" });
        } catch {
        }
      }
      return;
    }
  }
}
function echoOnlyAdapters(provider) {
  if (provider === "echo" || provider === "cat")
    return new EchoAdapter();
  throw new Error(`\u672A\u77E5 provider: '${provider}'\uFF08\u5185\u7F6E\u89E3\u6790\u5668\u53EA\u652F\u6301 echo\uFF1B\u5176\u4ED6 provider \u9700\u6CE8\u5165\u81EA\u5B9A\u4E49 resolveAdapter\uFF09`);
}

// packages/kernel/dist/loops/registry.js
import { readFileSync as readFileSync6 } from "node:fs";
import { join as join10 } from "node:path";
var KEY_RE2 = /^([A-Za-z_][\w.-]*):(?:\s+(.*)|\s*)$/;
function tokenize(text) {
  const tokens = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.trim() === "")
      continue;
    const trimmedStart = line.replace(/^\s*/, "");
    if (trimmedStart.startsWith("#"))
      continue;
    const indent = line.length - trimmedStart.length;
    const content = trimmedStart;
    if (content === "-" || content.startsWith("- ")) {
      const dashRest = content.slice(1);
      const after = dashRest.replace(/^\s*/, "");
      const itemCol = indent + 1 + (dashRest.length - after.length);
      tokens.push({ indent, kind: "dash" });
      if (after !== "") {
        const km2 = after.match(KEY_RE2);
        if (km2)
          tokens.push({ indent: itemCol, kind: "kv", key: km2[1], rest: km2[2] ?? "" });
        else
          tokens.push({ indent: itemCol, kind: "scalar", raw: after });
      }
      continue;
    }
    const km = content.match(KEY_RE2);
    if (km) {
      tokens.push({ indent, kind: "kv", key: km[1], rest: km[2] ?? "" });
    } else {
      tokens.push({ indent, kind: "scalar", raw: content });
    }
  }
  return tokens;
}
var YamlParseError = class extends Error {
};
function parseScalar(raw) {
  let s = raw.trim();
  if (!(s.startsWith('"') || s.startsWith("'") || s.startsWith("["))) {
    const cm = s.match(/^(.*?)\s+#.*$/);
    if (cm)
      s = cm[1].trimEnd();
  }
  if (s === "")
    return null;
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim();
    if (inner === "")
      return [];
    return inner.split(",").map((x) => parseScalar(x));
  }
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2)
    return s.slice(1, -1);
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
    return s.slice(1, -1);
  if (s === "null" || s === "~")
    return null;
  if (s === "true")
    return true;
  if (s === "false")
    return false;
  if (/^-?\d+$/.test(s))
    return Number(s);
  return s;
}
function parseMapping(tokens, start, indent) {
  const map = {};
  let i = start;
  while (i < tokens.length && tokens[i].indent === indent && tokens[i].kind === "kv") {
    const t = tokens[i];
    i++;
    if ((t.rest ?? "") === "") {
      if (i < tokens.length && tokens[i].indent > indent) {
        const r = parseValue(tokens, i, tokens[i].indent);
        map[t.key] = r.value;
        i = r.next;
      } else {
        map[t.key] = null;
      }
    } else {
      map[t.key] = parseScalar(t.rest);
    }
  }
  return { value: map, next: i };
}
function parseSequence(tokens, start, indent) {
  const arr = [];
  let i = start;
  while (i < tokens.length && tokens[i].indent === indent && tokens[i].kind === "dash") {
    i++;
    if (i < tokens.length && tokens[i].indent > indent) {
      const r = parseValue(tokens, i, tokens[i].indent);
      arr.push(r.value);
      i = r.next;
    } else {
      arr.push(null);
    }
  }
  return { value: arr, next: i };
}
function parseValue(tokens, i, indent) {
  const t = tokens[i];
  if (t.kind === "dash")
    return parseSequence(tokens, i, indent);
  if (t.kind === "kv")
    return parseMapping(tokens, i, indent);
  return { value: parseScalar(t.raw), next: i + 1 };
}
function parseLoopsYaml(text) {
  try {
    const tokens = tokenize(text);
    if (tokens.length === 0)
      return { data: null, error: "\u7A7A\u6587\u6863\uFF08\u65E0\u5185\u5BB9\uFF09" };
    const first = tokens[0];
    if (first.indent !== 0)
      throw new YamlParseError(`\u9876\u5C42\u610F\u5916\u7F29\u8FDB\uFF08\u7B2C\u4E00\u4E2A token indent=${first.indent}\uFF09`);
    let result;
    if (first.kind === "kv")
      result = parseMapping(tokens, 0, 0);
    else if (first.kind === "dash")
      result = parseSequence(tokens, 0, 0);
    else
      throw new YamlParseError("\u9876\u5C42\u5FC5\u987B\u662F mapping \u6216 sequence\uFF08\u5F97\u5230\u88F8\u6807\u91CF\uFF09");
    if (result.next !== tokens.length) {
      throw new YamlParseError(`\u6B8B\u7559\u672A\u89E3\u6790\u5185\u5BB9\uFF08\u81EA token #${result.next}\uFF0C\u7F29\u8FDB\u4E0D\u4E00\u81F4\u6216\u5B50\u96C6\u5916\u7ED3\u6784\uFF09`);
    }
    return { data: result.value, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}
var ANNOTATION_KEYWORDS = /* @__PURE__ */ new Set(["$schema", "$comment", "$id", "title", "description"]);
var VALIDATION_KEYWORDS = /* @__PURE__ */ new Set([
  "type",
  "required",
  "additionalProperties",
  "enum",
  "pattern",
  "minLength",
  "minItems",
  "minimum",
  "const",
  "properties",
  "items"
]);
function joinPath(path6, key) {
  return path6 === "" ? key : `${path6}.${key}`;
}
function typeMatches(instance, typeSpec) {
  const types = Array.isArray(typeSpec) ? typeSpec : [typeSpec];
  for (const t of types) {
    if (t === "object" && instance !== null && typeof instance === "object" && !Array.isArray(instance))
      return true;
    if (t === "array" && Array.isArray(instance))
      return true;
    if (t === "string" && typeof instance === "string")
      return true;
    if (t === "integer" && typeof instance === "number" && Number.isInteger(instance))
      return true;
    if (t === "number" && typeof instance === "number")
      return true;
    if (t === "boolean" && typeof instance === "boolean")
      return true;
    if (t === "null" && instance === null)
      return true;
  }
  return false;
}
function validateSchema(instance, schema, path6 = "") {
  if (typeof schema !== "object" || schema === null)
    return [];
  for (const kw of Object.keys(schema)) {
    if (!ANNOTATION_KEYWORDS.has(kw) && !VALIDATION_KEYWORDS.has(kw)) {
      throw new Error(`loops validator: unsupported schema keyword '${kw}' at ${path6 || "<root>"}`);
    }
  }
  const label = path6 || "<root>";
  const errors = [];
  if ("const" in schema) {
    if (instance !== schema.const) {
      errors.push(`${label}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(instance)}`);
      return errors;
    }
  }
  if ("type" in schema) {
    if (!typeMatches(instance, schema.type)) {
      errors.push(`${label}: expected type ${JSON.stringify(schema.type)}, got ${instance === null ? "null" : typeof instance}`);
      return errors;
    }
  }
  if ("enum" in schema && Array.isArray(schema.enum)) {
    if (!schema.enum.includes(instance)) {
      errors.push(`${label}: expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(instance)}`);
    }
  }
  if ("pattern" in schema && typeof instance === "string") {
    if (!new RegExp(schema.pattern).test(instance)) {
      errors.push(`${label}: does not match pattern ${JSON.stringify(schema.pattern)}`);
    }
  }
  if ("minLength" in schema && typeof instance === "string") {
    if (instance.length < schema.minLength) {
      errors.push(`${label}: expected minLength ${schema.minLength}, got length ${instance.length}`);
    }
  }
  if ("minItems" in schema && Array.isArray(instance)) {
    if (instance.length < schema.minItems) {
      errors.push(`${label}: expected minItems ${schema.minItems}, got ${instance.length}`);
    }
  }
  if ("minimum" in schema && typeof instance === "number") {
    if (instance < schema.minimum) {
      errors.push(`${label}: expected >= ${schema.minimum}, got ${instance}`);
    }
  }
  if (instance !== null && typeof instance === "object" && !Array.isArray(instance)) {
    const obj = instance;
    const props = schema.properties ?? {};
    for (const req of schema.required ?? []) {
      if (!(req in obj))
        errors.push(`${joinPath(path6, req)}: missing required field`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in props))
          errors.push(`${joinPath(path6, key)}: unexpected additional field (not in schema)`);
      }
    }
    for (const [key, subschema] of Object.entries(props)) {
      if (key in obj)
        errors.push(...validateSchema(obj[key], subschema, joinPath(path6, key)));
    }
  }
  if (Array.isArray(instance) && "items" in schema) {
    const itemSchema = schema.items;
    instance.forEach((item, idx) => errors.push(...validateSchema(item, itemSchema, `${path6}[${idx}]`)));
  }
  return errors;
}
var LOOPS_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  required: ["version", "loops"],
  additionalProperties: false,
  properties: {
    version: { const: 1 },
    loops: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: [
          "id",
          "name",
          "kind",
          "goal",
          "cadence",
          "risk",
          "runner",
          "change_prefix",
          "phases",
          "human_gates",
          "state",
          "design_doc",
          "status",
          "budget",
          "kill_criteria"
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", pattern: "^[a-z][a-z0-9-]*$" },
          name: { type: "string", minLength: 3 },
          kind: { type: "string", enum: ["orchestrator", "executor"] },
          goal: { type: "string", minLength: 10 },
          cadence: { type: "string", pattern: "^([0-9]+[mhd](-[0-9]+[mhd])?|continuous)$" },
          risk: { type: "string", enum: ["low", "medium", "high"] },
          runner: { type: "string", minLength: 2 },
          change_prefix: { type: ["string", "null"] },
          phases: { type: "array", minItems: 2, items: { type: "string" } },
          human_gates: { type: "array", minItems: 1, items: { type: "string" } },
          state: { type: "string", minLength: 2 },
          design_doc: { type: "string", minLength: 2 },
          status: { type: "string", enum: ["active", "paused", "retired"] },
          budget: {
            type: "object",
            required: ["max_runs_per_day", "max_in_flight", "on_exceed"],
            additionalProperties: false,
            properties: {
              max_runs_per_day: { type: "integer", minimum: 1 },
              max_in_flight: { type: "integer", minimum: 0 },
              on_exceed: { type: "string", minLength: 2 },
              // #36 token 级预算（可选，向后兼容——旧登记表不含即无 token 预算/熔断）：
              max_tokens_per_day: { type: "integer", minimum: 1 },
              tokens_per_run: { type: "integer", minimum: 1 }
            }
          },
          kill_criteria: { type: "array", minItems: 1, items: { type: "string" } },
          // 本轮新增：分级放权级别（可选；缺省 L1 由 loadRegistry 派生填充）。
          autonomy_level: { type: "string", enum: ["L1", "L2", "L3"] },
          // v5 决议 #12：路径 glob 白/黑名单（可选，缺省 [] 由 loadRegistry 派生填充；
          // denylist 运行时消费见 automation/lifecycle/denylist.ts）。
          allowlist: { type: "array", items: { type: "string" } },
          denylist: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
};
var nodeLoopIo = {
  readText: (p) => {
    try {
      return readFileSync6(p, "utf8");
    } catch {
      return null;
    }
  }
};
var LOOPS_REL_PATH = [".pipeline", "loops.yaml"];
function deriveRegistry(data) {
  const loops = data.loops.map((l) => ({
    ...l,
    autonomy_level: l.autonomy_level ?? "L1",
    allowlist: l.allowlist ?? [],
    denylist: l.denylist ?? []
  }));
  return { version: 1, loops };
}
function loadRegistry(repoRoot, io = nodeLoopIo) {
  const text = io.readText(join10(repoRoot, ...LOOPS_REL_PATH));
  if (text === null)
    return { data: null, errors: [] };
  const { data, error } = parseLoopsYaml(text);
  if (error !== null)
    return { data: null, errors: [`loops.yaml: ${error}`] };
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { data: null, errors: ["<root>: loops.yaml \u9876\u5C42\u5FC5\u987B\u662F mapping\uFF08\u5BF9\u8C61\uFF09"] };
  }
  const errors = validateSchema(data, LOOPS_SCHEMA);
  if (errors.length > 0)
    return { data: null, errors };
  return { data: deriveRegistry(data), errors: [] };
}

// packages/kernel/dist/loops/enforce.js
var FAIL_STREAK_KILL = 3;
var FAIL_STREAK_WARN = 2;
var DRY_ROUNDS_KILL = 2;
var DRY_ROUNDS_WARN = 1;
var BUDGET_WARN_RATIO = 0.8;
var STRIKE_MULTIPLIER = 2;
var IN_FLIGHT_STATES = /* @__PURE__ */ new Set(["queued", "running"]);
var KILL_RULES = /* @__PURE__ */ new Set(["R1", "R2", "R4", "R6"]);
var RESULT_RE = /result=(ok|fail|dry|skip)/;
var DRY_COUNT_RE = /干涸计数=(\d+)/;
var TS_FULL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
var TS_SHORT_RE = /^(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
var CADENCE_RE = /^(\d+)([mhd])$/;
var CADENCE_UNIT_MINUTES = { m: 1, h: 60, d: 1440 };
function emptyParsed() {
  return { runsToday: 0, failStreak: 0, dryRounds: 0, lastRunAt: null, latestRowOk: true };
}
function mkUTC(y, mo, d, hh, mm) {
  const dt = new Date(Date.UTC(y, mo - 1, d, hh, mm));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || dt.getUTCHours() !== hh || dt.getUTCMinutes() !== mm)
    return null;
  return dt;
}
function parseTimestamp(raw, now) {
  const s = raw.trim();
  const full = s.match(TS_FULL_RE);
  if (full)
    return mkUTC(+full[1], +full[2], +full[3], +full[4], +full[5]);
  const short = s.match(TS_SHORT_RE);
  if (short)
    return mkUTC(now.getUTCFullYear(), +short[1], +short[2], +short[3], +short[4]);
  return null;
}
function sameUTCDate(a, b) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}
function parseProgress(text, loopIds, now) {
  const result = /* @__PURE__ */ new Map();
  for (const id of loopIds)
    result.set(id, emptyParsed());
  if (text === null)
    return result;
  const known = new Set(loopIds);
  const rowsByLoop = /* @__PURE__ */ new Map();
  for (const id of loopIds)
    rowsByLoop.set(id, []);
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("|"))
      continue;
    const cols = line.replace(/^\|+/, "").replace(/\|+$/, "").split("|").map((c) => c.trim());
    if (cols.length !== 5)
      continue;
    const loopCol = cols[1];
    if (!known.has(loopCol))
      continue;
    const rowText = cols.join("|");
    const rm4 = rowText.match(RESULT_RE);
    const dm = rowText.match(DRY_COUNT_RE);
    rowsByLoop.get(loopCol).push({
      ts: parseTimestamp(cols[0], now),
      result: rm4 ? rm4[1] : null,
      dryCount: dm ? Number(dm[1]) : null
    });
  }
  for (const [id, rows] of rowsByLoop) {
    if (rows.length === 0)
      continue;
    const pl = result.get(id);
    const parseableTs = rows.map((r) => r.ts).filter((t) => t !== null);
    pl.runsToday = parseableTs.filter((t) => sameUTCDate(t, now)).length;
    pl.lastRunAt = parseableTs.length > 0 ? new Date(Math.max(...parseableTs.map((t) => t.getTime()))) : null;
    let failStreak = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].result !== "fail")
        break;
      failStreak++;
    }
    pl.failStreak = failStreak;
    let dryVal = null;
    for (const r of rows)
      if (r.dryCount !== null)
        dryVal = r.dryCount;
    if (dryVal !== null) {
      pl.dryRounds = dryVal;
    } else {
      let dryStreak = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].result !== "dry")
          break;
        dryStreak++;
      }
      pl.dryRounds = dryStreak;
    }
    const last = rows[rows.length - 1];
    pl.latestRowOk = last.ts !== null && last.result !== null;
  }
  return result;
}
function cadenceMinutes(cadence) {
  if (cadence === "continuous")
    return null;
  const upper = cadence.split("-").pop() ?? cadence;
  const m = upper.match(CADENCE_RE);
  if (!m)
    return null;
  return Number(m[1]) * CADENCE_UNIT_MINUTES[m[2]];
}
function budgetWarnThreshold(maxRuns) {
  return Math.ceil(maxRuns * 4 / 5);
}
function enforcementFor(level) {
  return level === "L1" ? "report-only" : level === "L2" ? "assisted" : "unattended";
}
function adjudicate(loop, facts, now) {
  const reasons = [];
  const { max_runs_per_day: maxRuns, max_in_flight: maxInFlight } = loop.budget;
  if (loop.status === "paused" || loop.status === "retired") {
    reasons.push({ rule: "R1", detail: `status=${loop.status}\uFF08kill switch \u5DF2\u89E6\u53D1\uFF09` });
  }
  if (facts.runsToday >= maxRuns) {
    reasons.push({ rule: "R2", detail: `runs_today=${facts.runsToday}\uFF08\u9608\u503C ${maxRuns}\uFF09` });
  } else if (facts.runsToday >= budgetWarnThreshold(maxRuns)) {
    reasons.push({ rule: "R3", detail: `runs_today=${facts.runsToday}\uFF08\u2265${Math.round(BUDGET_WARN_RATIO * 100)}% of ${maxRuns}\uFF09` });
  }
  if (facts.failStreak >= FAIL_STREAK_KILL) {
    reasons.push({ rule: "R4", detail: `fail_streak=${facts.failStreak}\uFF08\u9608\u503C ${FAIL_STREAK_KILL}\uFF09` });
  } else if (facts.failStreak === FAIL_STREAK_WARN) {
    reasons.push({ rule: "R5", detail: `fail_streak=${FAIL_STREAK_WARN}\uFF08\u9884\u8B66\uFF0C\u9608\u503C ${FAIL_STREAK_KILL}\uFF09` });
  }
  if (facts.dryRounds >= DRY_ROUNDS_KILL) {
    reasons.push({ rule: "R6", detail: `dry_rounds=${facts.dryRounds}\uFF08\u9608\u503C ${DRY_ROUNDS_KILL}\uFF09` });
  } else if (facts.dryRounds === DRY_ROUNDS_WARN) {
    reasons.push({ rule: "R7", detail: `dry_rounds=${DRY_ROUNDS_WARN}\uFF08\u9884\u8B66\uFF0C\u9608\u503C ${DRY_ROUNDS_KILL}\uFF09` });
  }
  if (facts.inFlight >= maxInFlight) {
    reasons.push({ rule: "R8", detail: `in_flight=${facts.inFlight}\uFF08\u9608\u503C ${maxInFlight}\uFF09` });
  }
  let minutesSince = null;
  if (facts.lastRunAt !== null) {
    minutesSince = (now.getTime() - facts.lastRunAt.getTime()) / 6e4;
    const cadence = cadenceMinutes(loop.cadence);
    if (cadence !== null && minutesSince > STRIKE_MULTIPLIER * cadence) {
      reasons.push({ rule: "R9", detail: `\u8DDD\u4E0A\u6B21\u8FD0\u884C ${Math.trunc(minutesSince)} \u5206\u949F\uFF08\u9608\u503C ${Math.trunc(STRIKE_MULTIPLIER * cadence)}\uFF09` });
    }
  }
  if (!facts.latestRowOk) {
    reasons.push({ rule: "R10", detail: "\u6700\u65B0\u884C\u7F3A result= token \u6216\u65F6\u95F4\u6233\u4E0D\u53EF\u89E3\u6790" });
  }
  for (const name2 of facts.misaccounted) {
    reasons.push({ rule: "R11", detail: `misaccounted: ${name2} sandbox at ship barrier, manual merge-back needed` });
  }
  let verdict;
  if (reasons.some((r) => KILL_RULES.has(r.rule)))
    verdict = "kill";
  else if (reasons.length > 0)
    verdict = "warn";
  else
    verdict = "ok";
  return {
    id: loop.id,
    verdict,
    autonomy_level: loop.autonomy_level,
    enforcement: enforcementFor(loop.autonomy_level),
    report_only: loop.autonomy_level === "L1",
    reasons,
    metrics: {
      runs_today: facts.runsToday,
      fail_streak: facts.failStreak,
      dry_rounds: facts.dryRounds,
      in_flight: facts.inFlight,
      minutes_since_last_run: minutesSince !== null ? Math.trunc(minutesSince) : null,
      latest_row_ok: facts.latestRowOk,
      misaccounted: facts.misaccounted.length
    }
  };
}
var SANDBOX_BARRIER = { phase: "ship", verify_result: "pass", branch_status: "handled" };
function countInFlight(fs, repoRoot, changePrefix) {
  const notes = [];
  if (!changePrefix)
    return { count: 0, notes };
  let count = 0;
  for (const name2 of fs.listChanges(repoRoot, changePrefix)) {
    const fields = fs.readChangeFields(repoRoot, name2);
    if (fields === null) {
      notes.push(`${name2}: \u7F3A/\u574F .pipeline.yaml\uFF0C\u8BA1\u5165 in_flight=0`);
      continue;
    }
    const automation = fields.automation;
    if (automation === void 0) {
      notes.push(`${name2}: automation \u5B57\u6BB5\u7F3A\u5931\uFF0C\u8BA1\u5165 in_flight=0`);
      continue;
    }
    if (IN_FLIGHT_STATES.has(automation))
      count++;
  }
  return { count, notes };
}
function auditShipBarrier(fs, repoRoot, changePrefix) {
  if (!changePrefix)
    return [];
  const misaccounted = [];
  for (const name2 of fs.listChanges(repoRoot, changePrefix)) {
    const ledger = fs.readChangeFields(repoRoot, name2);
    if (ledger === null || ledger.automation !== "failed")
      continue;
    const sandbox = fs.readSandboxFields(repoRoot, name2, ledger.automation_worktree ?? null);
    if (sandbox === null)
      continue;
    if (Object.entries(SANDBOX_BARRIER).every(([k, v]) => sandbox[k] === v))
      misaccounted.push(name2);
  }
  return misaccounted.sort();
}
function buildReport(repoRoot, opts, fs) {
  const { data, errors } = fs.loadRegistry(repoRoot);
  if (errors.length > 0)
    return { report: null, errors, exitCode: 3 };
  if (data === null)
    return { report: null, errors: [`loops.yaml \u672A\u627E\u5230\u4E8E ${repoRoot}/.pipeline/loops.yaml`], exitCode: 3 };
  let loops = data.loops;
  const onlyLoop = opts.onlyLoop ?? null;
  if (onlyLoop !== null) {
    if (!loops.some((l) => l.id === onlyLoop))
      return { report: null, errors: [`\u672A\u77E5 --loop id: ${onlyLoop}`], exitCode: 3 };
    loops = loops.filter((l) => l.id === onlyLoop);
  }
  const orchestrators = loops.filter((l) => l.kind === "orchestrator");
  const executors = loops.filter((l) => l.kind !== "orchestrator");
  const loopIds = orchestrators.map((l) => l.id);
  const parsed = parseProgress(fs.readProgress(repoRoot), loopIds, opts.now);
  const verdicts = [];
  const notes = [];
  for (const loop of orchestrators) {
    const { count, notes: ifNotes } = countInFlight(fs, repoRoot, loop.change_prefix);
    for (const n of ifNotes)
      notes.push(`${loop.id}: ${n}`);
    const misaccounted = auditShipBarrier(fs, repoRoot, loop.change_prefix);
    const p = parsed.get(loop.id);
    const facts = {
      runsToday: p.runsToday,
      failStreak: p.failStreak,
      dryRounds: p.dryRounds,
      lastRunAt: p.lastRunAt,
      latestRowOk: p.latestRowOk,
      inFlight: count,
      misaccounted
    };
    verdicts.push(adjudicate(loop, facts, opts.now));
  }
  const skipped = executors.map((l) => ({
    id: l.id,
    reason: `kind=${l.kind} \u4E0D\u5728\u88C1\u51B3\u8303\u56F4\uFF08state \u4E3A\u8C03\u5EA6\u5668\u65E5\u5FD7\uFF0C\u7531 service-doctor/\u5751\u5355 playbook \u6CBB\u7406\uFF09`
  }));
  const report = {
    version: 1,
    generated_at: opts.now.toISOString().slice(0, 16),
    verdicts,
    skipped,
    notes
  };
  const exitCode = verdicts.some((v) => v.verdict === "kill") ? 2 : verdicts.some((v) => v.verdict === "warn") ? 1 : 0;
  return { report, errors: [], exitCode };
}

// packages/kernel/dist/loops/budget.js
var PATTERN_TOKENS_PER_RUN = {
  low: 2e3,
  medium: 8e3,
  high: 2e4
};
var TS_FULL_RE2 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
var TS_SHORT_RE2 = /^(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
var TOKENS_RE = /tokens=(\d+)/;
function mkUTC2(y, mo, d, hh, mm) {
  const dt = new Date(Date.UTC(y, mo - 1, d, hh, mm));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || dt.getUTCHours() !== hh || dt.getUTCMinutes() !== mm)
    return null;
  return dt;
}
function parseTimestamp2(raw, now) {
  const s = raw.trim();
  const full = s.match(TS_FULL_RE2);
  if (full)
    return mkUTC2(+full[1], +full[2], +full[3], +full[4], +full[5]);
  const short = s.match(TS_SHORT_RE2);
  if (short)
    return mkUTC2(now.getUTCFullYear(), +short[1], +short[2], +short[3], +short[4]);
  return null;
}
function sameUTCDate2(a, b) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}
function sumRunLogTokens(text, loopId, now) {
  if (text === null)
    return { spentToday: 0, runsToday: 0 };
  let spentToday = 0;
  let runsToday = 0;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("|"))
      continue;
    const cols = line.replace(/^\|+/, "").replace(/\|+$/, "").split("|").map((c) => c.trim());
    if (cols.length < 2)
      continue;
    if (cols[1] !== loopId)
      continue;
    const ts = parseTimestamp2(cols[0], now);
    if (ts === null || !sameUTCDate2(ts, now))
      continue;
    runsToday++;
    const tm = line.match(TOKENS_RE);
    if (tm)
      spentToday += Number(tm[1]);
  }
  return { spentToday, runsToday };
}
function computeBudgetStatus(loop, runLogText, now) {
  const { spentToday, runsToday } = sumRunLogTokens(runLogText, loop.id, now);
  const budget = loop.budget;
  const max = budget.max_tokens_per_day ?? null;
  const reportOnly = loop.autonomy_level === "L1";
  if (max === null) {
    return {
      id: loop.id,
      hasBudget: false,
      maxTokensPerDay: null,
      warnThreshold: null,
      spentToday,
      remaining: null,
      usedRatio: null,
      runsToday,
      breaker: "ok",
      onExceed: budget.on_exceed,
      autonomyLevel: loop.autonomy_level,
      reportOnly,
      reason: `\u672A\u58F0\u660E max_tokens_per_day \u2014\u2014 \u65E0 token \u9884\u7B97/\u7194\u65AD\uFF08\u4EC5\u8FFD\u8E2A\u4ECA\u65E5\u82B1\u8D39 ${spentToday}\uFF09`
    };
  }
  const warnThreshold = budgetWarnThreshold(max);
  let breaker;
  let reason;
  if (spentToday >= max) {
    breaker = "tripped";
    reason = `\u4ECA\u65E5\u82B1\u8D39 ${spentToday} \u2265 \u9884\u7B97 ${max}\uFF08circuit breaker \u7194\u65AD\u89E6\u53D1\uFF09`;
  } else if (spentToday >= warnThreshold) {
    breaker = "warn";
    reason = `\u4ECA\u65E5\u82B1\u8D39 ${spentToday} \u2265 \u51CF\u901F\u7EBF ${warnThreshold}\uFF0880% of ${max}\uFF09`;
  } else {
    breaker = "ok";
    reason = `\u4ECA\u65E5\u82B1\u8D39 ${spentToday} < \u51CF\u901F\u7EBF ${warnThreshold}\uFF08\u9884\u7B97 ${max}\uFF09`;
  }
  return {
    id: loop.id,
    hasBudget: true,
    maxTokensPerDay: max,
    warnThreshold,
    spentToday,
    remaining: Math.max(0, max - spentToday),
    usedRatio: spentToday / max,
    runsToday,
    breaker,
    onExceed: budget.on_exceed,
    autonomyLevel: loop.autonomy_level,
    reportOnly,
    reason
  };
}
function estimateCost(loop) {
  const cadenceMin = cadenceMinutes(loop.cadence);
  const runsPerDay = cadenceMin === null ? null : Math.floor(1440 / cadenceMin);
  const budget = loop.budget;
  const declared = budget.tokens_per_run ?? null;
  const risk = loop.risk;
  const preset = PATTERN_TOKENS_PER_RUN[risk];
  const tokensPerRun = declared !== null ? declared : preset ?? PATTERN_TOKENS_PER_RUN.medium;
  const pattern = declared !== null ? "declared" : preset !== void 0 ? `risk:${risk}` : `risk:${risk}(\u672A\u77E5,\u6309 medium \u4F30)`;
  const estimatedTokensPerDay = runsPerDay === null ? null : runsPerDay * tokensPerRun;
  const max = budget.max_tokens_per_day ?? null;
  const withinBudget = max === null || estimatedTokensPerDay === null ? null : estimatedTokensPerDay <= max;
  const headroom = max === null || estimatedTokensPerDay === null ? null : max - estimatedTokensPerDay;
  return {
    id: loop.id,
    cadence: loop.cadence,
    runsPerDay,
    pattern,
    tokensPerRun,
    estimatedTokensPerDay,
    maxTokensPerDay: max,
    withinBudget,
    headroom
  };
}
function resolveLoops(repoRoot, onlyLoop, fs) {
  const { data, errors } = fs.loadRegistry(repoRoot);
  if (errors.length > 0)
    return { loops: null, errors, exitCode: 3 };
  if (data === null)
    return { loops: null, errors: [`loops.yaml \u672A\u627E\u5230\u4E8E ${repoRoot}/.pipeline/loops.yaml`], exitCode: 3 };
  let loops = data.loops;
  if (onlyLoop !== null) {
    if (!loops.some((l) => l.id === onlyLoop))
      return { loops: null, errors: [`\u672A\u77E5 --loop id: ${onlyLoop}`], exitCode: 3 };
    loops = loops.filter((l) => l.id === onlyLoop);
  }
  return { loops, errors: [], exitCode: 0 };
}
function buildBudgetReport(repoRoot, onlyLoop, now, fs) {
  const { loops, errors, exitCode } = resolveLoops(repoRoot, onlyLoop, fs);
  if (loops === null)
    return { report: null, errors, exitCode };
  const runLog = fs.readRunLog(repoRoot);
  const statuses = loops.map((l) => computeBudgetStatus(l, runLog, now));
  const code = statuses.some((s) => s.breaker === "tripped") ? 2 : statuses.some((s) => s.breaker === "warn") ? 1 : 0;
  return {
    report: { version: 1, generated_at: now.toISOString().slice(0, 16), statuses },
    errors: [],
    exitCode: code
  };
}
function buildCostReport(repoRoot, onlyLoop, now, fs) {
  const { loops, errors, exitCode } = resolveLoops(repoRoot, onlyLoop, fs);
  if (loops === null)
    return { report: null, errors, exitCode };
  const estimates = loops.map((l) => estimateCost(l));
  const code = estimates.some((e) => e.withinBudget === false) ? 1 : 0;
  return {
    report: { version: 1, generated_at: now.toISOString().slice(0, 16), estimates },
    errors: [],
    exitCode: code
  };
}

// packages/kernel/dist/loops/drift.js
var DRIFT_CADENCE_MULTIPLIER = 2;
var READY_STRONG = 90;
var READY_THRESHOLD = 70;
var TS_FULL_RE3 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
var TS_SHORT_RE3 = /^(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
var ID_RE = /^[a-z][a-z0-9-]*$/;
var CHANGE_RE = /change=([A-Za-z0-9._-]+)/g;
var DOC_HEADING_RE = /^###\s+.*?`([a-z][a-z0-9-]*)`/;
function mkUTC3(y, mo, d, hh, mm) {
  const dt = new Date(Date.UTC(y, mo - 1, d, hh, mm));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || dt.getUTCHours() !== hh || dt.getUTCMinutes() !== mm)
    return null;
  return dt;
}
function parseTimestamp3(raw, now) {
  const s = raw.trim();
  const full = s.match(TS_FULL_RE3);
  if (full)
    return mkUTC3(+full[1], +full[2], +full[3], +full[4], +full[5]);
  const short = s.match(TS_SHORT_RE3);
  if (short)
    return mkUTC3(now.getUTCFullYear(), +short[1], +short[2], +short[3], +short[4]);
  return null;
}
function sameUTCDate3(a, b) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}
function extractDocLoopIds(docText) {
  if (docText === null)
    return [];
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const rawLine of docText.split("\n")) {
    const m = rawLine.match(DOC_HEADING_RE);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}
function parseRunLog(text, now) {
  const map = /* @__PURE__ */ new Map();
  if (text === null)
    return map;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("|"))
      continue;
    const cols = line.replace(/^\|+/, "").replace(/\|+$/, "").split("|").map((c) => c.trim());
    if (cols.length < 2)
      continue;
    const ts = parseTimestamp3(cols[0], now);
    if (ts === null)
      continue;
    const id = cols[1];
    if (!ID_RE.test(id))
      continue;
    let f = map.get(id);
    if (!f) {
      f = { runs: 0, runsToday: 0, lastRunAt: null, changeRefs: [] };
      map.set(id, f);
    }
    f.runs++;
    if (sameUTCDate3(ts, now))
      f.runsToday++;
    if (f.lastRunAt === null || ts.getTime() > f.lastRunAt.getTime())
      f.lastRunAt = ts;
    for (const cm of line.matchAll(CHANGE_RE))
      f.changeRefs.push(cm[1]);
  }
  return map;
}
function detectDrift(registry, docText, runLogText, now) {
  const items = [];
  const regIds = new Set(registry.loops.map((l) => l.id));
  const runFacts = parseRunLog(runLogText, now);
  if (docText === null) {
    items.push({
      loop: "*",
      dimension: "mirror-missing",
      severity: "warn",
      detail: "LOOP.md \u7F3A\u5931\u2014\u2014\u65E0\u4EBA\u7C7B\u53EF\u8BFB\u955C\u50CF",
      suggestion: "\u521B\u5EFA\u4ED3\u6839 LOOP.md\uFF0C\u5E76\u4E3A\u6BCF\u4E2A registry loop \u5199\u4E00\u8282\uFF08### `id`\uFF09"
    });
  } else {
    const docIds = new Set(extractDocLoopIds(docText));
    for (const l of registry.loops) {
      if (!docIds.has(l.id)) {
        items.push({
          loop: l.id,
          dimension: "mirror-missing",
          severity: "warn",
          detail: `registry loop ${l.id} \u672A\u5728 LOOP.md \u63D0\u53CA`,
          suggestion: `\u5728 LOOP.md \u8865\u4E00\u8282 ### \`${l.id}\`\uFF0C\u540C\u6B65\u58F0\u660E\u534F\u8BAE\uFF08TestLoopMdMirror \u53E3\u5F84\uFF09`
        });
      }
    }
    for (const docId of docIds) {
      if (!regIds.has(docId)) {
        items.push({
          loop: docId,
          dimension: "mirror-orphan",
          severity: "warn",
          detail: `LOOP.md \u58F0\u660E\u7684 loop ${docId} \u4E0D\u5728 registry`,
          suggestion: `\u5220\u9664 LOOP.md \u4E2D ${docId} \u4E00\u8282\uFF0C\u6216\u8865\u56DE .pipeline/loops.yaml \u767B\u8BB0`
        });
      }
    }
  }
  for (const [runId] of runFacts) {
    if (!regIds.has(runId)) {
      items.push({
        loop: runId,
        dimension: "runlog-orphan-id",
        severity: "warn",
        detail: `run-log \u8BB0\u5F55\u4E86\u672A\u767B\u8BB0\u7684 loop ${runId}`,
        suggestion: `\u767B\u8BB0 ${runId} \u8FDB .pipeline/loops.yaml\uFF0C\u6216\u6838\u5BF9\u6D41\u6C34\u5F52\u5C5E\u5217\u662F\u5426\u5199\u9519`
      });
    }
  }
  for (const l of registry.loops) {
    const facts = runFacts.get(l.id) ?? null;
    const cadenceMin = cadenceMinutes(l.cadence);
    if (l.status === "active" && cadenceMin !== null) {
      if (facts === null || facts.runs === 0) {
        items.push({
          loop: l.id,
          dimension: "never-run",
          severity: "warn",
          detail: `\u58F0\u660E active \u6BCF ${l.cadence} \u4F46 run-log \u65E0\u4EFB\u4F55\u6267\u884C\u8BB0\u5F55`,
          suggestion: `\u786E\u8BA4 loop \u662F\u5426\u5DF2\u542F\u52A8\uFF1B\u82E5\u5DF2\u505C\u7528\u5E94\u6539 status=paused/retired`
        });
      } else if (facts.lastRunAt !== null) {
        const gap = (now.getTime() - facts.lastRunAt.getTime()) / 6e4;
        const threshold = DRIFT_CADENCE_MULTIPLIER * cadenceMin;
        if (gap > threshold) {
          const missed = Math.floor(gap / cadenceMin);
          items.push({
            loop: l.id,
            dimension: "cadence-idle",
            severity: "warn",
            detail: `\u58F0\u660E cadence ${l.cadence}\uFF08${cadenceMin}m\uFF09\u4F46\u8DDD\u4E0A\u6B21\u6267\u884C ${Math.trunc(gap)}m\uFF08>${Math.trunc(threshold)}m\uFF0C\u7EA6\u6F0F ${missed} \u8F6E\uFF09`,
            suggestion: `loop \u843D\u540E\u4E8E\u58F0\u660E\u8282\u594F\uFF0C\u68C0\u67E5\u8C03\u5EA6\u5668/\u7F16\u6392\u4F1A\u8BDD\u662F\u5426\u505C\u6446`
          });
        }
      }
    }
    if (l.change_prefix !== null && l.change_prefix !== "" && facts !== null) {
      const mismatched = [...new Set(facts.changeRefs.filter((c) => !c.startsWith(l.change_prefix)))];
      if (mismatched.length > 0) {
        items.push({
          loop: l.id,
          dimension: "change-prefix",
          severity: "warn",
          detail: `run-log change \u540D [${mismatched.join(", ")}] \u4E0D\u5339\u914D\u58F0\u660E change_prefix=${l.change_prefix}`,
          suggestion: `\u6838\u5BF9\u8FD9\u4E9B change \u7684\u5F52\u5C5E\uFF0C\u6216\u66F4\u6B63 loop \u7684 change_prefix`
        });
      }
    }
    if ((l.status === "paused" || l.status === "retired") && facts !== null && facts.runsToday > 0) {
      items.push({
        loop: l.id,
        dimension: "status-drift",
        severity: "warn",
        detail: `status=${l.status} \u4F46\u4ECA\u65E5\u4ECD\u6709 ${facts.runsToday} \u6B21\u6267\u884C\u8BB0\u5F55`,
        suggestion: `\u505C\u7528\u7684 loop \u4E0D\u5E94\u7EE7\u7EED\u6267\u884C\uFF1B\u68C0\u67E5\u8C03\u5EA6\u5668\u662F\u5426\u5FFD\u7565\u4E86 kill switch`
      });
    }
  }
  return {
    version: 1,
    generated_at: now.toISOString().slice(0, 16),
    clean: items.every((i) => i.severity !== "warn"),
    checked: registry.loops.map((l) => l.id),
    items
  };
}
function dim(name2, score, max, suggestion) {
  return { name: name2, score, max, suggestion: score >= max ? null : suggestion };
}
function computeReadiness(loop) {
  const dims = [];
  const goalLen = (loop.goal ?? "").trim().length;
  const goalScore = goalLen >= 30 ? 20 : goalLen >= 10 ? 12 : goalLen > 0 ? 6 : 0;
  dims.push(dim("goal", goalScore, 20, `goal \u5E94\u5199\u660E\u53EF\u6536\u655B\u7684\u660E\u786E\u76EE\u6807\uFF08\u5F53\u524D ${goalLen} \u5B57\u7B26\uFF0C\u5EFA\u8BAE \u226530\uFF09`));
  const killN = (loop.kill_criteria ?? []).length;
  dims.push(dim("kill_criteria", killN >= 2 ? 20 : killN === 1 ? 12 : 0, 20, `\u8865\u5145 kill/\u7EC8\u6B62\u5224\u636E\uFF08\u5F53\u524D ${killN} \u6761\uFF0C\u5EFA\u8BAE \u22652\uFF1A\u5982\u7A7A\u8F6E\u6536\u655B + \u8FDE\u8D25\u7194\u65AD\uFF09`));
  const gateN = (loop.human_gates ?? []).length;
  dims.push(dim("human_gates", gateN >= 2 ? 20 : gateN === 1 ? 12 : 0, 20, `\u8865\u5145 human gate \u4EBA\u5DE5\u95E8\uFF08\u5F53\u524D ${gateN} \u6761\uFF0C\u5EFA\u8BAE \u22652\uFF1A\u5982\u7834\u574F\u6027\u53D8\u66F4 + push/\u5408\u5E76\uFF09`));
  const b = loop.budget;
  const hasBase = !!b && typeof b.max_runs_per_day === "number" && b.max_runs_per_day >= 1 && typeof b.max_in_flight === "number";
  const hasToken = !!b && typeof b.max_tokens_per_day === "number";
  const budgetScore = (hasBase ? 10 : 0) + (hasToken ? 5 : 0);
  dims.push(dim("budget", budgetScore, 15, hasBase ? "\u58F0\u660E budget.max_tokens_per_day \u4EE5\u542F\u7528 token circuit breaker \u7194\u65AD\uFF08#36\uFF09" : "\u8865 budget.max_runs_per_day / max_in_flight \u8D44\u6E90\u4E0A\u9650"));
  const cadenceMin = cadenceMinutes(loop.cadence ?? "");
  const isContinuous = loop.cadence === "continuous";
  const cadenceScore = cadenceMin !== null ? 10 : isContinuous ? 6 : 0;
  dims.push(dim("cadence", cadenceScore, 10, isContinuous ? "continuous cadence \u65E0\u6CD5\u4F30\u7B97\u6BCF\u65E5\u6210\u672C\u2014\u2014\u82E5\u975E\u5E38\u9A7B\u6267\u884C\u5668\uFF0C\u8003\u8651\u8BBE\u6709\u9650 cadence" : "\u58F0\u660E\u53EF\u8C03\u5EA6\u7684\u6709\u9650 cadence\uFF08\u5982 1h / 30m\uFF09"));
  const hasPrefix = typeof loop.change_prefix === "string" && loop.change_prefix.trim() !== "";
  dims.push(dim("change_prefix", hasPrefix ? 5 : 0, 5, "\u58F0\u660E change_prefix \u4EE5\u9694\u79BB\u672C loop \u4EA7\u51FA\u7684 change\uFF08\u4FBF\u4E8E\u5728\u9014\u8BA1\u6570/\u5F52\u5C5E\u5BF9\u8D26\uFF09"));
  const hasDoc = (loop.design_doc ?? "").trim().length >= 2;
  const hasState = (loop.state ?? "").trim().length >= 2;
  dims.push(dim("observability", (hasDoc ? 5 : 0) + (hasState ? 5 : 0), 10, "\u8865 design_doc\uFF08\u8BBE\u8BA1\u6587\u6863\uFF09\u4E0E state\uFF08run-log \u8DEF\u5F84\uFF09\u4EE5\u4FDD\u8BC1\u53EF\u89C2\u6D4B"));
  const score = dims.reduce((a, d) => a + d.score, 0);
  const band = score >= READY_STRONG ? "ready" : score >= READY_THRESHOLD ? "mostly-ready" : "not-ready";
  const suggestions = dims.filter((d) => d.suggestion !== null).map((d) => `[${d.name}] ${d.suggestion}`);
  return { id: loop.id, score, band, dimensions: dims, suggestions };
}
function resolveRegistry(repoRoot, onlyLoop, fs) {
  const { data, errors } = fs.loadRegistry(repoRoot);
  if (errors.length > 0)
    return { registry: null, errors, exitCode: 3 };
  if (data === null)
    return { registry: null, errors: [`loops.yaml \u672A\u627E\u5230\u4E8E ${repoRoot}/.pipeline/loops.yaml`], exitCode: 3 };
  if (onlyLoop !== null && !data.loops.some((l) => l.id === onlyLoop)) {
    return { registry: null, errors: [`\u672A\u77E5 --loop id: ${onlyLoop}`], exitCode: 3 };
  }
  return { registry: data, errors: [], exitCode: 0 };
}
function buildDriftReport(repoRoot, onlyLoop, now, fs) {
  const { registry, errors, exitCode } = resolveRegistry(repoRoot, onlyLoop, fs);
  if (registry === null)
    return { report: null, errors, exitCode };
  const full = detectDrift(registry, fs.readLoopDoc(repoRoot), fs.readRunLog(repoRoot), now);
  const items = onlyLoop === null ? full.items : full.items.filter((i) => i.loop === onlyLoop);
  const checked = onlyLoop === null ? full.checked : [onlyLoop];
  const report = {
    version: 1,
    generated_at: full.generated_at,
    clean: items.every((i) => i.severity !== "warn"),
    checked,
    items
  };
  return { report, errors: [], exitCode: report.clean ? 0 : 1 };
}
function buildAuditReport(repoRoot, onlyLoop, now, fs) {
  const { registry, errors, exitCode } = resolveRegistry(repoRoot, onlyLoop, fs);
  if (registry === null)
    return { report: null, errors, exitCode };
  const loops = onlyLoop === null ? registry.loops : registry.loops.filter((l) => l.id === onlyLoop);
  const scores = loops.map(computeReadiness);
  const code = scores.some((s) => s.band === "not-ready") ? 1 : 0;
  return {
    report: { version: 1, generated_at: now.toISOString().slice(0, 16), scores },
    errors: [],
    exitCode: code
  };
}

// packages/kernel/dist/loops/types.js
var LOOP_RUNNERS = ["claude-code", "codex"];

// packages/kernel/dist/loops/yamlBlock.js
function indentOf2(line) {
  return line.length - line.replace(/^\s*/, "").length;
}
function locateLoop(lines, loopId) {
  const idRe = /^(\s*)-(\s+)id:\s+(.+?)\s*(?:#.*)?$/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(idRe);
    if (!m || m[3].trim() !== loopId)
      continue;
    const dashIndent = m[1].length;
    const fieldIndent = dashIndent + 1 + m[2].length;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === "")
        continue;
      if (indentOf2(line) <= dashIndent) {
        end = j;
        break;
      }
    }
    return { start: i, end, dashIndent, fieldIndent };
  }
  return null;
}
function insertPointAtBlockEnd(lines, start, end) {
  for (let i = end - 1; i > start; i--) {
    if (lines[i].trim() !== "")
      return i + 1;
  }
  return end;
}

// packages/kernel/dist/loops/graduation.js
var MIN_L2_RUNS_FOR_L3 = 5;
var ORDER = ["L1", "L2", "L3"];
function nextUp(level) {
  return ORDER[Math.min(ORDER.indexOf(level) + 1, ORDER.length - 1)];
}
function nextDown(level) {
  return ORDER[Math.max(ORDER.indexOf(level) - 1, 0)];
}
var HIST_TS_RE = /^(?:\d{4}-)?\d{2}-\d{2}T\d{2}:\d{2}$/;
var HIST_RESULT_RE = /result=(ok|fail|dry|skip)/;
function parseRunHistory(text, loopId) {
  if (text === null)
    return { runs: 0, failStreak: 0, lastResult: null };
  const results = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("|"))
      continue;
    const cols = line.replace(/^\|+/, "").replace(/\|+$/, "").split("|").map((c) => c.trim());
    if (cols.length < 2 || cols[1] !== loopId)
      continue;
    if (!HIST_TS_RE.test(cols[0]))
      continue;
    const rm4 = line.match(HIST_RESULT_RE);
    results.push(rm4 ? rm4[1] : null);
  }
  let failStreak = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i] === "fail")
      failStreak++;
    else
      break;
  }
  return {
    runs: results.length,
    failStreak,
    lastResult: results.length > 0 ? results[results.length - 1] : null
  };
}
function decideGraduation(inp) {
  const current = inp.loop.autonomy_level;
  const activeDrift = inp.drift.filter((d) => d.severity === "warn");
  const driftCount = activeDrift.length;
  const breaker = inp.budget.breaker;
  const failStreak = inp.history.failStreak;
  const runs = inp.history.runs;
  const score = inp.readiness.score;
  const demotionSignals = [];
  if (breaker === "tripped")
    demotionSignals.push("circuit breaker tripped\uFF08\u4ECA\u65E5 token \u82B1\u8D39\u8D85\u9884\u7B97\uFF0C#36 \u7194\u65AD\uFF09");
  if (failStreak >= FAIL_STREAK_WARN)
    demotionSignals.push(`\u8FDE\u8D25 fail_streak=${failStreak}\uFF08\u2265${FAIL_STREAK_WARN} \u9884\u8B66\u7EBF\uFF09`);
  if (driftCount > 0)
    demotionSignals.push(`${driftCount} \u9879\u6D3B\u8DC3\u6F02\u79FB\uFF08\u58F0\u660E vs \u5B9E\u9645\u4E0D\u4E00\u81F4\uFF0C#37\uFF09`);
  const canDemote = current !== "L1" && demotionSignals.length > 0;
  const blockers = [];
  if (current === "L3") {
    blockers.push("\u5DF2\u5728\u6700\u9AD8\u81EA\u6CBB\u6863 L3\uFF08unattended\uFF09\u2014\u2014\u65E0\u66F4\u9AD8\u6863\u53EF\u5347");
  } else {
    const target = nextUp(current);
    const minScore = current === "L1" ? READY_THRESHOLD : READY_STRONG;
    if (score < minScore)
      blockers.push(`loop-ready ${score} < ${minScore}\uFF08\u5347 ${target} \u9700\u5C31\u7EEA\u5EA6 \u2265${minScore}\uFF0C#37\uFF09`);
    if (driftCount > 0)
      blockers.push(`${driftCount} \u9879\u6D3B\u8DC3\u6F02\u79FB\u672A\u6E05\uFF08\u5347\u6863\u524D\u987B\u65E0\u6F02\u79FB\uFF0C#37\uFF09`);
    if (breaker === "tripped")
      blockers.push("circuit breaker tripped\uFF08\u7194\u65AD\u4E2D\u4E0D\u5F97\u5347\u6863\uFF0C#36\uFF09");
    else if (breaker === "warn")
      blockers.push("token \u82B1\u8D39 \u226580% \u51CF\u901F\u7EBF\uFF08\u63A5\u8FD1\u9884\u7B97\u4E0D\u5F97\u5347\u6863\uFF0C#36\uFF09");
    if (failStreak > 0)
      blockers.push(`\u8FDE\u8D25\u4E2D fail_streak=${failStreak}\uFF08\u5347\u6863\u524D\u987B\u65E0\u5931\u8D25\uFF09`);
    if (target === "L3" && runs < MIN_L2_RUNS_FOR_L3) {
      blockers.push(`L2 \u8FD0\u884C\u5386\u53F2\u4E0D\u8DB3\uFF08${runs}/${MIN_L2_RUNS_FOR_L3} \u8F6E\uFF09\u2014\u2014\u5347 L3 \u9700 \u2265${MIN_L2_RUNS_FOR_L3} \u8F6E\u65E0\u5931\u8D25`);
    }
  }
  const canGraduate = !canDemote && current !== "L3" && blockers.length === 0;
  let recommended = current;
  let demotionReason = null;
  if (canDemote) {
    recommended = nextDown(current);
    demotionReason = demotionSignals.join("\uFF1B");
  } else if (canGraduate) {
    recommended = nextUp(current);
  }
  return {
    id: inp.loop.id,
    current,
    recommended,
    enforcement: enforcementFor(current),
    canGraduate,
    blockers,
    demotionReason,
    demotionSignals,
    readinessScore: score,
    readinessBand: inp.readiness.band,
    driftCount,
    breaker,
    failStreak,
    runs
  };
}
function planLevelChange(current, target, verdict) {
  const base = { id: verdict.id, from: current };
  if (!ORDER.includes(target)) {
    return { ...base, to: null, kind: "reject-unknown-level", allowed: false, reason: `\u672A\u77E5\u76EE\u6807\u6863 '${target}'\uFF08\u652F\u6301 L1/L2/L3\uFF09`, blockers: [] };
  }
  const to = target;
  const ci = ORDER.indexOf(current);
  const ti = ORDER.indexOf(to);
  if (ti === ci) {
    return { ...base, to, kind: "noop", allowed: false, reason: `\u5DF2\u5728 ${current}\uFF0C\u65E0\u9700\u6539\u6863`, blockers: [] };
  }
  if (ti < ci) {
    return { ...base, to, kind: "demote", allowed: true, reason: `\u5B89\u5168\u964D\u6863 ${current} \u2192 ${to}\uFF08\u964D\u4F4E\u81EA\u6CBB\u603B\u5141\u8BB8\uFF09`, blockers: [] };
  }
  if (ti - ci > 1) {
    return {
      ...base,
      to: null,
      kind: "reject-cross-level",
      allowed: false,
      reason: `\u8DE8\u7EA7\u5347\u6863\u88AB\u62D2\uFF1A${current} \u2192 ${to}\uFF08\u4E00\u6B65\u8DE8 ${ti - ci} \u7EA7\uFF09\u3002\u5206\u7EA7\u653E\u6743\u987B\u9010\u7EA7\u6BD5\u4E1A\uFF1A\u5148\u5347 ${nextUp(current)}`,
      blockers: []
    };
  }
  if (!verdict.canGraduate) {
    return { ...base, to: null, kind: "reject-blocked", allowed: false, reason: `\u5347 ${to} \u51C6\u5165\u672A\u901A\u8FC7`, blockers: verdict.blockers };
  }
  return { ...base, to, kind: "promote", allowed: true, reason: `\u9010\u7EA7\u6BD5\u4E1A ${current} \u2192 ${to}`, blockers: [] };
}
function setAutonomyLevelInYaml(text, loopId, level) {
  const lines = text.split("\n");
  const block = locateLoop(lines, loopId);
  if (block === null)
    return { text: null, error: `loop '${loopId}' \u672A\u5728 loops.yaml \u627E\u5230\uFF08\u65E0\u6CD5\u6539\u6863\uFF09` };
  const levelRe = /^(\s*)autonomy_level:\s*.*$/;
  for (let i = block.start; i < block.end; i++) {
    const m = lines[i].match(levelRe);
    if (m) {
      lines[i] = `${m[1]}autonomy_level: ${level}`;
      return { text: lines.join("\n"), error: null };
    }
  }
  lines.splice(insertPointAtBlockEnd(lines, block.start, block.end), 0, `${" ".repeat(block.dashIndent + 2)}autonomy_level: ${level}`);
  return { text: lines.join("\n"), error: null };
}
function gatherInputs(loop, registry, runLog, doc, now) {
  const driftAll = detectDrift(registry, doc, runLog, now);
  return {
    loop,
    readiness: computeReadiness(loop),
    drift: driftAll.items.filter((i) => i.loop === loop.id),
    budget: computeBudgetStatus(loop, runLog, now),
    history: parseRunHistory(runLog, loop.id)
  };
}
function buildGraduationReport(repoRoot, onlyLoop, now, fs) {
  const { data, errors } = fs.loadRegistry(repoRoot);
  if (errors.length > 0)
    return { report: null, errors, exitCode: 3 };
  if (data === null)
    return { report: null, errors: [`loops.yaml \u672A\u627E\u5230\u4E8E ${repoRoot}/.pipeline/loops.yaml`], exitCode: 3 };
  if (onlyLoop !== null && !data.loops.some((l) => l.id === onlyLoop)) {
    return { report: null, errors: [`\u672A\u77E5 --loop id: ${onlyLoop}`], exitCode: 3 };
  }
  const runLog = fs.readRunLog(repoRoot);
  const doc = fs.readLoopDoc(repoRoot);
  const loops = onlyLoop === null ? data.loops : data.loops.filter((l) => l.id === onlyLoop);
  const verdicts = loops.map((l) => decideGraduation(gatherInputs(l, data, runLog, doc, now)));
  const code = verdicts.some((v) => v.demotionReason !== null) ? 2 : verdicts.some((v) => v.canGraduate) ? 1 : 0;
  return { report: { version: 1, generated_at: now.toISOString().slice(0, 16), verdicts }, errors: [], exitCode: code };
}
function applyLevelChange(repoRoot, loopId, target, opts, fs) {
  const { data, errors } = fs.loadRegistry(repoRoot);
  if (errors.length > 0)
    return { plan: null, verdict: null, applied: false, errors, exitCode: 3 };
  if (data === null)
    return { plan: null, verdict: null, applied: false, errors: [`loops.yaml \u672A\u627E\u5230\u4E8E ${repoRoot}/.pipeline/loops.yaml`], exitCode: 3 };
  const loop = data.loops.find((l) => l.id === loopId);
  if (!loop)
    return { plan: null, verdict: null, applied: false, errors: [`\u672A\u77E5 loop id: ${loopId}`], exitCode: 3 };
  const verdict = decideGraduation(gatherInputs(loop, data, fs.readRunLog(repoRoot), fs.readLoopDoc(repoRoot), opts.now));
  const plan = planLevelChange(loop.autonomy_level, target, verdict);
  if (plan.kind === "noop")
    return { plan, verdict, applied: false, errors: [], exitCode: 0 };
  if (!plan.allowed)
    return { plan, verdict, applied: false, errors: [plan.reason, ...plan.blockers], exitCode: 2 };
  if (!opts.confirm)
    return { plan, verdict, applied: false, errors: [], exitCode: 0 };
  const text = fs.readRegistryText(repoRoot);
  if (text === null)
    return { plan, verdict, applied: false, errors: ["\u65E0\u6CD5\u8BFB\u53D6 .pipeline/loops.yaml \u539F\u6587\u4EE5\u5199\u56DE"], exitCode: 3 };
  const { text: next, error } = setAutonomyLevelInYaml(text, loopId, plan.to);
  if (error !== null || next === null)
    return { plan, verdict, applied: false, errors: [error ?? "\u6539\u6863\u5199\u56DE\u5931\u8D25"], exitCode: 3 };
  const recheck = fs.readRegistryText(repoRoot);
  if (recheck !== text) {
    const yamlPath = `${repoRoot}/.pipeline/loops.yaml`;
    return {
      plan,
      verdict,
      applied: false,
      errors: [recheck === null ? `CAS \u5931\u8D25\uFF1Aloops.yaml \u5728\u6539\u6863\u5199\u56DE\u671F\u95F4\u88AB\u5220\u9664\uFF0C\u5DF2\u5982\u5B9E\u62D2\u7EDD\uFF08\u672A\u843D\u76D8\uFF0C${yamlPath}\uFF09` : `CAS \u5931\u8D25\uFF1Aloops.yaml \u5728\u6539\u6863\u5199\u56DE\u671F\u95F4\u88AB\u5E76\u53D1\u4FEE\u6539\uFF0C\u5DF2\u5982\u5B9E\u62D2\u7EDD\uFF08\u672A\u843D\u76D8\uFF0C${yamlPath}\uFF09`],
      exitCode: 3
    };
  }
  fs.writeRegistryText(repoRoot, next);
  return { plan, verdict, applied: true, errors: [], exitCode: 0 };
}

// packages/kernel/dist/loops/drafts.js
import { readFileSync as readFileSync7 } from "node:fs";
import { mkdir as mkdir5, rename as rename4, writeFile as writeFile5 } from "node:fs/promises";
import { dirname as dirname4, join as join11 } from "node:path";
var DRAFT_MARKS_FILE = "loops.drafts.json";
function draftMarksPath(repoRoot) {
  return join11(repoRoot, ".pipeline", DRAFT_MARKS_FILE);
}
function readDraftMarks(path6) {
  try {
    const data = JSON.parse(readFileSync7(path6, "utf8"));
    if (typeof data === "object" && data !== null && !Array.isArray(data) && data.version === 1 && Array.isArray(data.ids) && data.ids.every((x) => typeof x === "string")) {
      return [...data.ids];
    }
    return [];
  } catch {
    return [];
  }
}
var tmpSeq3 = 0;
async function writeDraftMarks(path6, ids) {
  await mkdir5(dirname4(path6), { recursive: true });
  const tmp = `${path6}.tmp.${process.pid}.${tmpSeq3++}`;
  await writeFile5(tmp, `${JSON.stringify({ version: 1, ids }, null, 2)}
`, "utf8");
  await rename4(tmp, path6);
}
async function addDraftMark(path6, id) {
  const existing = readDraftMarks(path6);
  if (existing.includes(id))
    return;
  await writeDraftMarks(path6, [...existing, id]);
}

// packages/kernel/dist/loops/update.js
var PATCHABLE_SCALAR_FIELDS = ["cadence", "goal", "design_doc", "change_prefix", "risk", "status", "runner"];
var PATCHABLE_BUDGET_FIELDS = ["max_runs_per_day", "max_in_flight", "max_tokens_per_day", "on_exceed"];
var PATCHABLE_ARRAY_FIELDS = ["human_gates", "kill_criteria", "allowlist", "denylist"];
var ALL_PATCHABLE = [...PATCHABLE_SCALAR_FIELDS, ...PATCHABLE_BUDGET_FIELDS, ...PATCHABLE_ARRAY_FIELDS];
var CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;
var PatchError = class extends Error {
};
function bareRoundtrips(s) {
  const { data, error } = parseLoopsYaml(`k: ${s}`);
  if (error !== null || data === null || typeof data !== "object" || Array.isArray(data))
    return false;
  return data.k === s;
}
var ITEM_KEY_LIKE_RE = /^[A-Za-z_][\w.-]*:(\s|$)/;
function formatString(s, field2, asSeqItem) {
  if (CONTROL_CHAR_RE.test(s))
    throw new PatchError(`\u5B57\u6BB5 '${field2}' \u542B\u6362\u884C/\u63A7\u5236\u5B57\u7B26\uFF0C\u65E0\u6CD5\u5199\u56DE loops.yaml`);
  if (bareRoundtrips(s) && !(asSeqItem && ITEM_KEY_LIKE_RE.test(s)))
    return s;
  if (s.includes('"'))
    throw new PatchError(`\u5B57\u6BB5 '${field2}' \u542B\u53CC\u5F15\u53F7\uFF0C\u7A84 YAML \u65E0\u8F6C\u4E49\u8BED\u4E49\uFF0C\u65E0\u6CD5\u5B89\u5168\u5199\u56DE`);
  return `"${s}"`;
}
function formatScalar(v, field2) {
  if (v === null)
    return "null";
  if (typeof v === "number") {
    if (!Number.isFinite(v))
      throw new PatchError(`\u5B57\u6BB5 '${field2}' \u987B\u4E3A\u6709\u9650\u6570\u5B57`);
    return String(v);
  }
  return formatString(v, field2, false);
}
function renderLoopEntryLines(entry) {
  const lines = [`  - id: ${formatScalar(entry.id, "id")}`];
  const scalar6 = (field2, v) => {
    lines.push(`    ${field2}: ${formatScalar(v, field2)}`);
  };
  const seq2 = (field2, values) => {
    if (values.length === 0) {
      lines.push(`    ${field2}: []`);
      return;
    }
    lines.push(`    ${field2}:`);
    for (const v of values)
      lines.push(`      - ${formatString(v, field2, true)}`);
  };
  scalar6("name", entry.name);
  scalar6("kind", entry.kind);
  scalar6("goal", entry.goal);
  scalar6("cadence", entry.cadence);
  scalar6("risk", entry.risk);
  scalar6("runner", entry.runner);
  scalar6("change_prefix", entry.change_prefix);
  seq2("phases", entry.phases);
  seq2("human_gates", entry.human_gates);
  scalar6("state", entry.state);
  scalar6("design_doc", entry.design_doc);
  scalar6("status", entry.status);
  lines.push("    budget:");
  const budgetScalar = (field2, v) => {
    lines.push(`      ${field2}: ${formatScalar(v, field2)}`);
  };
  budgetScalar("max_runs_per_day", entry.budget.max_runs_per_day);
  budgetScalar("max_in_flight", entry.budget.max_in_flight);
  budgetScalar("on_exceed", entry.budget.on_exceed);
  if (entry.budget.max_tokens_per_day !== void 0)
    budgetScalar("max_tokens_per_day", entry.budget.max_tokens_per_day);
  if (entry.budget.tokens_per_run !== void 0)
    budgetScalar("tokens_per_run", entry.budget.tokens_per_run);
  seq2("kill_criteria", entry.kill_criteria);
  return lines;
}
function selfCheckYamlText(text) {
  const { data, error } = parseLoopsYaml(text);
  if (error !== null)
    return `\u4EA7\u51FA\u6587\u672C\u672A\u8FC7\u7A84\u89E3\u6790\u5668\uFF1A${error}`;
  const errors = validateSchema(data, LOOPS_SCHEMA);
  if (errors.length > 0)
    return `\u4EA7\u51FA\u6587\u672C\u672A\u8FC7 LOOPS_SCHEMA\uFF1A${errors.join("\uFF1B")}`;
  return null;
}
function createLoopsYamlText(entry) {
  try {
    const text = `${["version: 1", "loops:", ...renderLoopEntryLines(entry)].join("\n")}
`;
    const bad = selfCheckYamlText(text);
    if (bad !== null)
      throw new PatchError(bad);
    return { text, error: null };
  } catch (e) {
    if (e instanceof PatchError)
      return { text: null, error: e.message };
    throw e;
  }
}
function appendLoopToYamlText(before, entry) {
  try {
    const { data, error } = parseLoopsYaml(before);
    if (error !== null)
      throw new PatchError(`\u65E2\u6709 loops.yaml \u672A\u8FC7\u7A84\u89E3\u6790\u5668\uFF0C\u62D2\u7EDD\u8FFD\u52A0\uFF1A${error}`);
    const loops = data !== null && typeof data === "object" && !Array.isArray(data) ? data.loops : void 0;
    if (Array.isArray(loops)) {
      const exists = loops.some((item) => item !== null && typeof item === "object" && !Array.isArray(item) && item.id === entry.id);
      if (exists)
        throw new PatchError(`loop '${entry.id}' \u5DF2\u5B58\u5728\u4E8E loops.yaml\uFF08\u8FFD\u52A0\u4E0D\u8986\u76D6\uFF1B\u6539\u5B57\u6BB5\u8D70 updateLoopInYaml\uFF09`);
    }
    const base = before.endsWith("\n") ? before : `${before}
`;
    const text = `${base}${renderLoopEntryLines(entry).join("\n")}
`;
    const bad = selfCheckYamlText(text);
    if (bad !== null)
      throw new PatchError(bad);
    return { text, error: null };
  } catch (e) {
    if (e instanceof PatchError)
      return { text: null, error: e.message };
    throw e;
  }
}

// packages/kernel/dist/compress/markdown.js
function isHeading(line) {
  const m = /^(#{1,6}) +(\S.*?) *$/.exec(line);
  if (!m)
    return null;
  return { level: (m[1] ?? "").length, text: (m[2] ?? "").trim() };
}
var DECISION_RE = [
  /\bdecision\b/i,
  /\bdecided\b/i,
  /\bwe (?:will|chose|decided|adopt|use|opt for|are going with)\b/i,
  /\bchosen\b/i,
  /\bconclusion\b/i,
  /\brationale\b/i,
  /\btrade[- ]?off/i,
  /决策|决定|结论|选定|采用|取舍|因此采/
];
function isDecision(line) {
  return DECISION_RE.some((re) => re.test(line));
}
var CONSTRAINT_RE = [
  /\bMUST(?:\s+NOT)?\b/,
  /\bSHALL(?:\s+NOT)?\b/,
  /\bREQUIRED\b/,
  /\bconstraint\b/i,
  /\bforbidden\b/i,
  /必须|禁止|不允许|不得|约束|强制|严禁/
];
function isConstraint(line) {
  return CONSTRAINT_RE.some((re) => re.test(line));
}
var OPEN_CHECKBOX = /^\s*[-*+]\s+\[ \]\s+(.*\S)\s*$/;
var DONE_CHECKBOX = /^\s*[-*+]\s+\[[xX]\]\s+/;
var TODO_KEYWORD = /\bTODO\b|\bFIXME\b|待办|待做|待完成/;
function isDoneTodo(line) {
  return DONE_CHECKBOX.test(line);
}
function openTodoText(line) {
  const m = OPEN_CHECKBOX.exec(line);
  if (m)
    return (m[1] ?? "").trim();
  if (!DONE_CHECKBOX.test(line) && TODO_KEYWORD.test(line))
    return stripLeadMarkers(line);
  return null;
}
function stripLeadMarkers(line) {
  let s = line.trim();
  for (; ; ) {
    const next = s.replace(/^(?:>\s*|[-*+]\s+)/, "");
    if (next === s)
      break;
    s = next.trim();
  }
  return s;
}
function parseFrontMatter(lines) {
  if (lines[0] !== "---")
    return { keyFields: [], bodyStart: 0 };
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      close = i;
      break;
    }
  }
  if (close === -1)
    return { keyFields: [], bodyStart: 0 };
  const keyFields = [];
  for (let i = 1; i < close; i++) {
    const m = /^([A-Za-z_][\w -]*):\s*(.*)$/.exec(lines[i] ?? "");
    if (m)
      keyFields.push({ key: (m[1] ?? "").trim(), value: (m[2] ?? "").trim() });
  }
  return { keyFields, bodyStart: close + 1 };
}

// packages/kernel/dist/compress/compress.js
function ratioOf(originalChars, compressedChars) {
  if (originalChars <= 0)
    return 0;
  return Math.round((1 - compressedChars / originalChars) * 1e4) / 1e4;
}
function dedup(items) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const raw of items) {
    const key = raw.trim();
    if (key === "" || seen.has(key))
      continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}
function compressDocument(text, opts = {}) {
  const maxDepth = opts.maxHeadingDepth ?? 6;
  const rawLines = text.split("\n");
  const fm = parseFrontMatter(rawLines);
  let title = null;
  const headings = [];
  const decisions = [];
  const constraints = [];
  const openTodos = [];
  let doneTodoCount = 0;
  let inCode = false;
  for (let i = fm.bodyStart; i < rawLines.length; i++) {
    const line = rawLines[i] ?? "";
    if (/^\s*(?:```|~~~)/.test(line)) {
      inCode = !inCode;
      continue;
    }
    if (inCode)
      continue;
    const h = isHeading(line);
    if (h) {
      if (h.level === 1 && title === null)
        title = h.text;
      if (h.level <= maxDepth)
        headings.push("#".repeat(h.level) + " " + h.text);
      continue;
    }
    if (isDoneTodo(line)) {
      doneTodoCount += 1;
      continue;
    }
    const todo = openTodoText(line);
    if (todo !== null) {
      openTodos.push(todo);
      continue;
    }
    if (isConstraint(line)) {
      constraints.push(stripLeadMarkers(line));
      continue;
    }
    if (isDecision(line)) {
      decisions.push(stripLeadMarkers(line));
      continue;
    }
  }
  const doc = {
    title,
    headings: dedup(headings),
    decisions: dedup(decisions),
    constraints: dedup(constraints),
    openTodos: dedup(openTodos),
    doneTodoCount,
    keyFields: fm.keyFields,
    stats: emptyStats()
  };
  doc.stats = statsFor(text, rawLines.length, renderHandoffSummary(doc), doc);
  return doc;
}
function emptyStats() {
  return {
    originalChars: 0,
    originalLines: 0,
    compressedChars: 0,
    compressedLines: 0,
    keptLines: 0,
    droppedLines: 0,
    ratio: 0
  };
}
function statsFor(originalText, originalLines, rendered, doc) {
  const originalChars = originalText.length;
  const compressedChars = rendered.length;
  const compressedLines = rendered === "" ? 0 : rendered.split("\n").length;
  const keptLines = doc.headings.length + doc.decisions.length + doc.constraints.length + doc.openTodos.length + doc.keyFields.length;
  return {
    originalChars,
    originalLines,
    compressedChars,
    compressedLines,
    keptLines,
    droppedLines: Math.max(0, originalLines - keptLines),
    ratio: ratioOf(originalChars, compressedChars)
  };
}
function renderHandoffSummary(doc, label) {
  const out = [];
  out.push(`# Handoff: ${label ?? doc.title ?? "summary"}`);
  if (doc.headings.length > 0) {
    out.push("", "## Structure");
    for (const h of doc.headings)
      out.push(`- ${h}`);
  }
  if (doc.decisions.length > 0) {
    out.push("", `## Decisions (${doc.decisions.length})`);
    for (const d of doc.decisions)
      out.push(`- ${d}`);
  }
  if (doc.constraints.length > 0) {
    out.push("", `## Constraints (${doc.constraints.length})`);
    for (const c of doc.constraints)
      out.push(`- ${c}`);
  }
  if (doc.openTodos.length > 0) {
    out.push("", `## Open TODOs (${doc.openTodos.length})`);
    for (const t of doc.openTodos)
      out.push(`- [ ] ${t}`);
  }
  if (doc.keyFields.length > 0) {
    out.push("", "## Key Fields");
    for (const k of doc.keyFields)
      out.push(`- ${k.key}: ${k.value}`);
  }
  return out.join("\n");
}

// packages/kernel/dist/compress/handoff.js
import { existsSync as existsSync4, readFileSync as readFileSync8 } from "node:fs";
import { isAbsolute as isAbsolute2, join as join12 } from "node:path";
function nodeHandoffFs() {
  return {
    exists: (p) => existsSync4(p),
    readText: (p) => {
      try {
        return readFileSync8(p, "utf8");
      } catch {
        return void 0;
      }
    }
  };
}
var PHASE_DOCS = {
  open: [{ label: "proposal", kind: "changefile", ref: "proposal.md" }],
  explore: [
    { label: "proposal", kind: "changefile", ref: "proposal.md" },
    { label: "design_doc", kind: "field", ref: "design_doc" },
    { label: "design", kind: "changefile", ref: "design.md" }
  ],
  spec: [
    { label: "design_doc", kind: "field", ref: "design_doc" },
    { label: "design", kind: "changefile", ref: "design.md" },
    { label: "proposal", kind: "changefile", ref: "proposal.md" },
    { label: "tasks", kind: "changefile", ref: "tasks.md" }
  ],
  build: [
    { label: "plan", kind: "field", ref: "plan" },
    { label: "tasks", kind: "changefile", ref: "tasks.md" },
    { label: "design_doc", kind: "field", ref: "design_doc" },
    { label: "design", kind: "changefile", ref: "design.md" }
  ],
  verify: [
    { label: "verification_report", kind: "field", ref: "verification_report" },
    { label: "verification_report", kind: "changefile", ref: "verification_report.md" },
    { label: "tasks", kind: "changefile", ref: "tasks.md" }
  ],
  ship: [
    { label: "verification_report", kind: "field", ref: "verification_report" },
    { label: "design_doc", kind: "field", ref: "design_doc" }
  ],
  archive: [
    { label: "verification_report", kind: "field", ref: "verification_report" },
    { label: "design_doc", kind: "field", ref: "design_doc" }
  ]
};
function phaseHandoffDocs(phase) {
  return (PHASE_DOCS[phase] ?? []).map((s) => ({ ...s }));
}
function scalar2(v) {
  if (v === void 0)
    return "";
  return Array.isArray(v) ? v.join(",") : v;
}
function isUnset2(v) {
  return v === "" || v === "null";
}
function resolveSpec(spec, input) {
  if (spec.kind === "field") {
    const val = scalar2(input.fields[spec.ref]).trim();
    if (isUnset2(val))
      return null;
    return { abs: isAbsolute2(val) ? val : join12(input.cwd, val), display: val };
  }
  return {
    abs: join12(input.cwd, input.changeDirRel, spec.ref),
    display: `${input.changeDirRel}/${spec.ref}`
  };
}
function emptyAggregate() {
  return {
    originalChars: 0,
    originalLines: 0,
    compressedChars: 0,
    compressedLines: 0,
    keptLines: 0,
    droppedLines: 0,
    ratio: 0
  };
}
function buildHandoff(input, fs) {
  const specs = input.specs ?? phaseHandoffDocs(input.phase);
  const docs = [];
  const seen = /* @__PURE__ */ new Set();
  for (const spec of specs) {
    const r = resolveSpec(spec, input);
    if (r === null || seen.has(r.abs))
      continue;
    seen.add(r.abs);
    const text = fs.readText(r.abs);
    if (text === void 0 || text.trim() === "")
      continue;
    const doc = compressDocument(text);
    const summary = renderHandoffSummary(doc, `${input.name}/${spec.label}`);
    doc.stats = statsFor(text, doc.stats.originalLines, summary, doc);
    docs.push({ label: spec.label, path: r.display, doc, summary });
  }
  if (docs.length === 0) {
    return { name: input.name, phase: input.phase, docs, aggregate: emptyAggregate() };
  }
  const sum = (pick) => docs.reduce((a, d) => a + pick(d.doc.stats), 0);
  const originalChars = sum((s) => s.originalChars);
  const compressedChars = sum((s) => s.compressedChars);
  const aggregate = {
    originalChars,
    compressedChars,
    originalLines: sum((s) => s.originalLines),
    compressedLines: sum((s) => s.compressedLines),
    keptLines: sum((s) => s.keptLines),
    droppedLines: sum((s) => s.droppedLines),
    ratio: ratioOf(originalChars, compressedChars)
  };
  return { name: input.name, phase: input.phase, docs, aggregate };
}

// packages/kernel/dist/scaffold/doc-scaffold.js
var PROJECT_TYPES = ["web", "cli", "lib"];
function isProjectType(v) {
  return PROJECT_TYPES.includes(v);
}
var DOC_STRATEGIES = ["skip", "overwrite", "append"];
function isDocStrategy(v) {
  return DOC_STRATEGIES.includes(v);
}
var DEFAULT_SPEC_DIR = "openspec/specs";
var SCAFFOLD_MARKER = "<!-- pipeline:scaffold -->";
var SPEC_DOC_LAYOUTS = {
  web: [
    { rel: "frontend/README.md", title: "Frontend Spec", summary: "\u524D\u7AEF\u8303\u56F4\u3001\u9875\u9762/\u8DEF\u7531\u3001\u7EC4\u4EF6\u5951\u7EA6\u3002" },
    { rel: "frontend/components.md", title: "Component Contracts", summary: "\u5173\u952E\u7EC4\u4EF6\u7684 props/\u72B6\u6001/\u4EA4\u4E92\u5951\u7EA6\u3002" },
    { rel: "backend/README.md", title: "Backend Spec", summary: "\u540E\u7AEF\u8303\u56F4\u3001\u670D\u52A1\u8FB9\u754C\u3001\u804C\u8D23\u5212\u5206\u3002" },
    { rel: "backend/api.md", title: "API Contracts", summary: "\u5BF9\u5916 HTTP/RPC \u63A5\u53E3\u7684\u8BF7\u6C42/\u54CD\u5E94\u5951\u7EA6\u3002" },
    { rel: "backend/data-model.md", title: "Data Model", summary: "\u5B9E\u4F53\u3001\u5173\u7CFB\u3001\u6301\u4E45\u5316\u4E0E\u8FC1\u79FB\u7EA6\u675F\u3002" },
    { rel: "guides/getting-started.md", title: "Getting Started", summary: "\u672C\u5730\u8D77\u6B65\u3001\u8FD0\u884C\u3001\u8C03\u8BD5\u8DEF\u5F84\u3002" },
    { rel: "guides/architecture.md", title: "Architecture", summary: "\u7CFB\u7EDF\u5206\u5C42\u3001\u4F9D\u8D56\u65B9\u5411\u3001\u5173\u952E\u51B3\u7B56\u3002" }
  ],
  cli: [
    { rel: "commands/README.md", title: "Command Surface", summary: "\u547D\u4EE4/\u5B50\u547D\u4EE4\u6E05\u5355\u4E0E\u603B\u4F53\u5FC3\u667A\u6A21\u578B\u3002" },
    { rel: "commands/reference.md", title: "Command Reference", summary: "\u9010\u547D\u4EE4 flag\u3001\u9000\u51FA\u7801\u3001stdout/stderr \u5951\u7EA6\u3002" },
    { rel: "guides/getting-started.md", title: "Getting Started", summary: "\u5B89\u88C5\u3001\u4E00\u884C\u4E0A\u624B\u30015 \u5206\u949F\u5FC3\u667A\u6A21\u578B\u3002" },
    { rel: "guides/architecture.md", title: "Architecture", summary: "\u5185\u6838/\u547D\u4EE4\u5206\u5C42\u3001\u4F9D\u8D56\u6CE8\u5165\u9762\u3001\u53EF\u79FB\u690D\u6027\u3002" }
  ],
  lib: [
    { rel: "api/README.md", title: "Public API", summary: "\u5BF9\u5916\u5BFC\u51FA\u9762\u3001\u7A33\u5B9A\u6027\u627F\u8BFA\u3001\u7248\u672C\u7B56\u7565\u3002" },
    { rel: "api/reference.md", title: "API Reference", summary: "\u9010\u7B26\u53F7\u7B7E\u540D\u3001\u53C2\u6570/\u8FD4\u56DE\u5951\u7EA6\u3001\u9519\u8BEF\u8BED\u4E49\u3002" },
    { rel: "guides/getting-started.md", title: "Getting Started", summary: "\u5B89\u88C5\u3001\u6700\u5C0F\u53EF\u7528\u793A\u4F8B\u3001\u96C6\u6210\u8DEF\u5F84\u3002" },
    { rel: "guides/architecture.md", title: "Architecture", summary: "\u5185\u90E8\u5206\u5C42\u3001\u7EAF\u903B\u8F91/\u526F\u4F5C\u7528\u8FB9\u754C\u3001\u6269\u5C55\u70B9\u3002" }
  ]
};
function renderScaffoldDoc(spec) {
  return `${SCAFFOLD_MARKER}
# ${spec.title}

${spec.summary}

> TODO(explore): \u5728 explore/spec \u9636\u6BB5\u8865\u5168\u672C\u6587\u6863\u3002\u5220\u9664\u672C\u884C\u4E0E scaffold marker \u8868\u793A\u5DF2\u8BA4\u9886\u3002
`;
}
function buildSpecScaffold(type, specDir = DEFAULT_SPEC_DIR) {
  const base = specDir.replace(/\/+$/, "");
  return SPEC_DOC_LAYOUTS[type].map((spec) => ({
    rel: `${base}/${spec.rel}`,
    content: renderScaffoldDoc(spec)
  }));
}
function planDocScaffold(files, existing, strategy) {
  const present = files.filter((f) => existing.has(f.rel));
  if (strategy === "skip") {
    if (present.length > 0) {
      return { strategy, writes: [], removes: [], skipped: files.map((f) => f.rel), skippedAll: true };
    }
    return { strategy, writes: [...files], removes: [], skipped: [], skippedAll: false };
  }
  if (strategy === "overwrite") {
    return {
      strategy,
      writes: [...files],
      removes: present.map((f) => f.rel).sort(),
      skipped: [],
      skippedAll: false
    };
  }
  const writes = files.filter((f) => !existing.has(f.rel));
  return {
    strategy,
    writes,
    removes: [],
    skipped: present.map((f) => f.rel),
    skippedAll: false
  };
}

// packages/kernel/dist/scaffold/workflow-resolution.js
var NATIVE_WORKFLOW_ID = "native";
var WORKFLOW_MD_REL = ".pipeline/workflow.md";
var WORKFLOW_SOURCE_MARKER = ".pipeline-workflow-source";
function parseWorkflowIds(indexText) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const raw of indexText.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#"))
      continue;
    const id = line.split(/\s+/)[0] ?? "";
    if (id === "" || id === NATIVE_WORKFLOW_ID)
      continue;
    if (seen.has(id))
      continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
function resolveWorkflow(requested, available) {
  if (requested === void 0 || requested === "" || requested === NATIVE_WORKFLOW_ID) {
    return { ok: true, id: NATIVE_WORKFLOW_ID, isNative: true, source: false };
  }
  if (available.includes(requested)) {
    return { ok: true, id: requested, isNative: false, source: true };
  }
  return {
    ok: false,
    error: `unknown workflow id '${requested}' (available: ${available.length ? available.join(", ") : "(none)"} + native)`,
    available: [...available]
  };
}
function workflowHashAction(isNative) {
  return isNative ? "record" : "remove";
}
function removeWorkflowHash(hashes, key) {
  const norm2 = normalizeOwnedKey(key);
  const out = { ...hashes };
  if (norm2 !== void 0)
    delete out[norm2];
  delete out[key];
  return out;
}
function applyWorkflowHashContract(hashes, key, isNative, content) {
  if (!isNative)
    return removeWorkflowHash(hashes, key);
  if (content === void 0)
    return { ...hashes };
  return recordOwned(hashes, key, computeContentHash(content));
}
function workflowSourceMarkerContent(id, source, ts) {
  return `id=${id}
source=${source ?? ""}
resolved_at=${ts}
# \u672C workflow \u7531 --workflow-source \u89E3\u6790\u800C\u6765\uFF1B\u5347\u7EA7\u65F6\u7ECF removeHash \u5951\u7EA6\u4FDD\u7559\uFF0C\u4E0D\u8FD8\u539F native\u3002
`;
}

// packages/kernel/dist/workflow/loadWorkflow.js
import { existsSync as existsSync5, readFileSync as readFileSync9 } from "node:fs";
import { join as join13 } from "node:path";

// packages/kernel/dist/workflow/parse.js
function parseInlineList(raw) {
  const trimmed = raw.trim();
  if (trimmed === "[]")
    return [];
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1A\u671F\u671B [a, b] \u5F62\u6001\u7684\u5355\u884C\u5217\u8868\uFF0C\u5B9E\u9645 '${raw}'`);
  }
  return trimmed.slice(1, -1).split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}
function indentOf3(line) {
  return line.length - line.trimStart().length;
}
function parseSkillsBlock(cur, baseIndent) {
  const skills = [];
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? "";
    if (line.trim() === "") {
      cur.i++;
      continue;
    }
    if (indentOf3(line) < baseIndent)
      break;
    const idMatch = /^\s*-\s+id:\s*(\S+)\s*$/.exec(line);
    if (!idMatch)
      break;
    cur.i++;
    let depends_on;
    const next = cur.lines[cur.i] ?? "";
    const depMatch = /^\s*depends_on:\s*(\[.*\])\s*$/.exec(next);
    if (depMatch && indentOf3(next) > baseIndent) {
      depends_on = parseInlineList(depMatch[1]);
      cur.i++;
    }
    skills.push(depends_on ? { id: idMatch[1], depends_on } : { id: idMatch[1] });
  }
  return skills;
}
function parseFieldRefBlock(cur, baseIndent) {
  const refs = [];
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? "";
    if (line.trim() === "") {
      cur.i++;
      continue;
    }
    if (indentOf3(line) < baseIndent)
      break;
    const fieldMatch = /^\s*-\s+field:\s*(\S+)\s*$/.exec(line);
    if (!fieldMatch)
      break;
    cur.i++;
    const typeLine = cur.lines[cur.i] ?? "";
    const typeMatch = /^\s*type:\s*(string|file_path|boolean)\s*$/.exec(typeLine);
    if (!typeMatch)
      throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1Afield '${fieldMatch[1]}' \u7F3A type`);
    cur.i++;
    refs.push({ field: fieldMatch[1], type: typeMatch[1] });
  }
  return refs;
}
function parseGuardsBlock(cur, baseIndent) {
  const guards = [];
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? "";
    if (line.trim() === "") {
      cur.i++;
      continue;
    }
    if (indentOf3(line) < baseIndent)
      break;
    const typeMatch = /^\s*-\s+type:\s*(tasks-at-least|nonempty-output)\s*$/.exec(line);
    if (!typeMatch)
      break;
    cur.i++;
    const kind = typeMatch[1];
    if (kind === "tasks-at-least") {
      const nLine = cur.lines[cur.i] ?? "";
      const nMatch = /^\s*n:\s*(\d+)\s*$/.exec(nLine);
      if (!nMatch)
        throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1Aguard 'tasks-at-least' \u7F3A n`);
      cur.i++;
      guards.push({ type: "tasks-at-least", n: Number(nMatch[1]) });
    } else {
      guards.push({ type: "nonempty-output" });
    }
  }
  return guards;
}
function parseTransitionsBlock(cur, baseIndent) {
  const transitions = [];
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? "";
    if (line.trim() === "") {
      cur.i++;
      continue;
    }
    if (indentOf3(line) < baseIndent)
      break;
    const eventMatch = /^\s*-\s+event:\s*(\S+)\s*$/.exec(line);
    if (!eventMatch)
      break;
    cur.i++;
    const toLine = cur.lines[cur.i] ?? "";
    const toMatch = /^\s*to:\s*(\S+)\s*$/.exec(toLine);
    if (!toMatch)
      throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1Atransitions \u91CC event '${eventMatch[1]}' \u7F3A to`);
    cur.i++;
    transitions.push({ event: eventMatch[1], to: toMatch[1] });
  }
  return transitions;
}
function parseStep(cur) {
  const idLine = cur.lines[cur.i] ?? "";
  const idMatch = /^\s*-\s+id:\s*(\S+)\s*$/.exec(idLine);
  if (!idMatch)
    throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1A\u671F\u671B '- id: <name>'\uFF0C\u5B9E\u9645 '${idLine}'`);
  const baseIndent = indentOf3(idLine) + 2;
  cur.i++;
  let label = "";
  let gate = null;
  let skills = [];
  let inputs = [];
  let outputs = [];
  let guards = [];
  let transitions = [];
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? "";
    if (line.trim() === "") {
      cur.i++;
      continue;
    }
    if (indentOf3(line) < baseIndent - 2)
      break;
    if (/^\s*label:\s*(.+)$/.test(line)) {
      label = /^\s*label:\s*(.+)$/.exec(line)[1].trim();
      cur.i++;
      continue;
    }
    if (/^\s*gate:\s*(review|confirm|null)\s*$/.test(line)) {
      const v = /^\s*gate:\s*(review|confirm|null)\s*$/.exec(line)[1];
      gate = v === "null" ? null : v;
      cur.i++;
      continue;
    }
    if (/^\s*skills:\s*\[\]\s*$/.test(line)) {
      skills = [];
      cur.i++;
      continue;
    }
    if (/^\s*skills:\s*$/.test(line)) {
      cur.i++;
      skills = parseSkillsBlock(cur, baseIndent);
      continue;
    }
    if (/^\s*inputs:\s*\[\]\s*$/.test(line)) {
      inputs = [];
      cur.i++;
      continue;
    }
    if (/^\s*inputs:\s*$/.test(line)) {
      cur.i++;
      inputs = parseFieldRefBlock(cur, baseIndent);
      continue;
    }
    if (/^\s*outputs:\s*\[\]\s*$/.test(line)) {
      outputs = [];
      cur.i++;
      continue;
    }
    if (/^\s*outputs:\s*$/.test(line)) {
      cur.i++;
      outputs = parseFieldRefBlock(cur, baseIndent);
      continue;
    }
    if (/^\s*guards:\s*\[\]\s*$/.test(line)) {
      cur.i++;
      continue;
    }
    if (/^\s*guards:\s*$/.test(line)) {
      cur.i++;
      guards = parseGuardsBlock(cur, baseIndent);
      continue;
    }
    if (/^\s*transitions:\s*\[\]\s*$/.test(line)) {
      transitions = [];
      cur.i++;
      continue;
    }
    if (/^\s*transitions:\s*$/.test(line)) {
      cur.i++;
      transitions = parseTransitionsBlock(cur, baseIndent);
      continue;
    }
    break;
  }
  return { id: idMatch[1], label, gate, skills, inputs, outputs, guards, transitions };
}
function parseWorkflow(content) {
  const lines = content.split("\n");
  const nameMatch = /^name:\s*(\S+)\s*$/.exec(lines[0] ?? "");
  if (!nameMatch)
    throw new Error("workflow \u89E3\u6790\u9519\u8BEF\uFF1A\u7B2C\u4E00\u884C\u5FC5\u987B\u662F 'name: <name>'");
  if ((lines[1] ?? "").trim() !== "steps:")
    throw new Error("workflow \u89E3\u6790\u9519\u8BEF\uFF1A\u7B2C\u4E8C\u884C\u5FC5\u987B\u662F 'steps:'");
  const cur = { lines, i: 2 };
  const steps = [];
  while (cur.i < lines.length) {
    if ((lines[cur.i] ?? "").trim() === "") {
      cur.i++;
      continue;
    }
    if (!/^\s*-\s+id:/.test(lines[cur.i] ?? "")) {
      throw new Error(`workflow \u89E3\u6790\u9519\u8BEF\uFF1Asteps \u4E0B\u6BCF\u9879\u5FC5\u987B\u4EE5 '- id:' \u5F00\u5934\uFF0C\u5B9E\u9645 '${lines[cur.i]}'`);
    }
    steps.push(parseStep(cur));
  }
  return { name: nameMatch[1], steps };
}

// packages/kernel/dist/workflow/validate.js
function detectCycle(skillIds, dependsOn) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(skillIds.map((id) => [id, WHITE]));
  const errors = [];
  function visit(id, path6) {
    color.set(id, GRAY);
    for (const dep of dependsOn.get(id) ?? []) {
      if (color.get(dep) === GRAY) {
        errors.push(`\u5FAA\u73AF\u4F9D\u8D56\uFF1A${[...path6, id, dep].join(" -> ")}`);
        continue;
      }
      if (color.get(dep) === WHITE)
        visit(dep, [...path6, id]);
    }
    color.set(id, BLACK);
  }
  for (const id of skillIds) {
    if (color.get(id) === WHITE)
      visit(id, []);
  }
  return errors;
}
var IDENT_RE = /^[a-zA-Z0-9_-]+$/;
var SKILL_IDENT_RE = /^[a-zA-Z0-9_-]+(?::[a-zA-Z0-9_-]+)*$/;
function validateWorkflow(wf) {
  const errors = [];
  const producedByEarlierStep = /* @__PURE__ */ new Set();
  const allStepIds = new Set(wf.steps.map((s) => s.id));
  if (!IDENT_RE.test(wf.name)) {
    errors.push(`workflow name '${wf.name}' \u542B\u975E\u6CD5\u5B57\u7B26\uFF08\u4EC5\u5141\u8BB8 a-zA-Z0-9_-\uFF09`);
  }
  wf.steps.forEach((step, index) => {
    if (!IDENT_RE.test(step.id)) {
      errors.push(`step id '${step.id}' \u542B\u975E\u6CD5\u5B57\u7B26\uFF08\u4EC5\u5141\u8BB8 a-zA-Z0-9_-\uFF09`);
    }
    for (const skill of step.skills) {
      if (!SKILL_IDENT_RE.test(skill.id)) {
        errors.push(`step '${step.id}' \u7684 skill id '${skill.id}' \u542B\u975E\u6CD5\u5B57\u7B26\uFF08\u4EC5\u5141\u8BB8 a-zA-Z0-9_- \u53CA\u547D\u540D\u7A7A\u95F4\u5192\u53F7\uFF0C\u5982 superpowers:brainstorming\uFF09`);
      }
    }
    for (const ref of [...step.inputs, ...step.outputs]) {
      if (!IDENT_RE.test(ref.field)) {
        errors.push(`step '${step.id}' \u7684\u5B57\u6BB5 '${ref.field}' \u542B\u975E\u6CD5\u5B57\u7B26\uFF08\u4EC5\u5141\u8BB8 a-zA-Z0-9_-\uFF09`);
      }
    }
    for (const t of step.transitions) {
      if (!IDENT_RE.test(t.event)) {
        errors.push(`step '${step.id}' \u7684 transitions \u91CC event '${t.event}' \u542B\u975E\u6CD5\u5B57\u7B26\uFF08\u4EC5\u5141\u8BB8 a-zA-Z0-9_-\uFF09`);
      }
    }
    const skillIds = step.skills.map((s) => s.id);
    const dependsOn = new Map(step.skills.map((s) => [s.id, [...s.depends_on ?? []]]));
    for (const skill of step.skills) {
      for (const dep of skill.depends_on ?? []) {
        if (!skillIds.includes(dep)) {
          errors.push(`step '${step.id}' \u7684 skill '${skill.id}' \u4F9D\u8D56\u4E86\u540C step \u5185\u4E0D\u5B58\u5728\u7684 '${dep}'`);
        }
      }
    }
    errors.push(...detectCycle(skillIds, dependsOn).map((e) => `step '${step.id}': ${e}`));
    for (const input of step.inputs) {
      if (!producedByEarlierStep.has(input.field)) {
        errors.push(`step '${step.id}' \u7684 inputs \u5B57\u6BB5 '${input.field}' \u4E0D\u5BF9\u5E94\u4EFB\u4F55\u66F4\u65E9 step \u7684 outputs`);
      }
    }
    for (const output of step.outputs)
      producedByEarlierStep.add(output.field);
    for (const t of step.transitions) {
      if (!allStepIds.has(t.to)) {
        errors.push(`step '${step.id}' \u7684 transitions \u91CC event '${t.event}' \u7684 to '${t.to}' \u4E0D\u5B58\u5728`);
      }
    }
    const isLastStep = index === wf.steps.length - 1;
    if (!isLastStep && step.transitions.length === 0) {
      errors.push(`step '${step.id}' \u6CA1\u6709\u58F0\u660E\u4EFB\u4F55 transitions\uFF08\u4E0D\u662F\u6700\u540E\u4E00\u4E2A step\uFF0C\u4F1A\u5BFC\u81F4\u8D70\u8FDB\u6B7B\u8DEF\uFF09`);
    }
  });
  return errors;
}

// packages/kernel/dist/workflow/loadWorkflow.js
function loadWorkflow(repoRoot, name2) {
  const p = join13(repoRoot, ".pipeline", "workflows", `${name2}.yaml`);
  if (!existsSync5(p))
    return null;
  const wf = parseWorkflow(readFileSync9(p, "utf8"));
  const errors = validateWorkflow(wf);
  if (errors.length > 0) {
    throw new Error(`ERROR: workflow '${name2}' \u6821\u9A8C\u5931\u8D25\uFF08${p}\uFF09\uFF1A
${errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  return wf;
}

// packages/kernel/dist/workflow/stepGuard.js
import { readFileSync as readFileSync10 } from "node:fs";
import path5 from "node:path";
function scalar3(v) {
  return typeof v === "string" ? v : "";
}
function readTasksMd(changeDirAbs) {
  try {
    return readFileSync10(path5.join(changeDirAbs, "tasks.md"), "utf8");
  } catch {
    return void 0;
  }
}
function evaluateStepGuards(state, step, ctx) {
  const failures = [];
  for (const guard of step.guards) {
    if (guard.type === "nonempty-output") {
      for (const output of step.outputs) {
        const v = scalar3(state.fields[output.field]);
        if (!v || v === "null") {
          failures.push(`\u5B57\u6BB5 '${output.field}' \u672A\u8BBE\u7F6E\uFF08step '${step.id}' \u58F0\u660E\u4E3A\u5FC5\u987B\u4EA7\u51FA\uFF09`);
        }
      }
    }
    if (guard.type === "tasks-at-least") {
      const count = taskCount(readTasksMd(ctx.changeDirAbs));
      if (count < guard.n) {
        failures.push(`step '${step.id}' \u8981\u6C42 tasks.md \u81F3\u5C11 ${guard.n} \u4E2A\u4EFB\u52A1\uFF08\u5F53\u524D=${count}\uFF09`);
      }
    }
  }
  return { pass: failures.length === 0, failures };
}

// packages/kernel/dist/workflow/engine.js
function fieldStr(state, k) {
  const v = state.fields[k];
  return Array.isArray(v) ? v.join(",") : v ?? "";
}
function resolveWorkflowName(state) {
  return fieldStr(state, "workflow") || "default";
}
function resolveStep(wf, stepId) {
  return wf.steps.find((s) => s.id === stepId) ?? null;
}
function firstStep(wf) {
  return wf.steps[0] ?? null;
}
function planStepTransition(wf, state, event, ctx) {
  const stepId = fieldStr(state, "phase");
  const step = resolveStep(wf, stepId);
  if (!step)
    return { ok: false, kind: "step-not-in-graph", stepId };
  const edge = step.transitions.find((t) => t.event === event);
  if (!edge) {
    return { ok: false, kind: "event-unsupported", stepId, available: step.transitions.map((t) => t.event) };
  }
  const guardResult = evaluateStepGuards(state, step, ctx);
  if (!guardResult.pass) {
    return { ok: false, kind: "guard-failed", stepId, failures: guardResult.failures };
  }
  return { ok: true, from: stepId, to: edge.to };
}
function applyStepTransition(state, to, clock) {
  return { ...state, fields: { ...state.fields, phase: to, updated_at: clock() } };
}

// packages/kernel/dist/workflow/skillDag.js
function isSkillUnlocked(skillId, skills, completedSinceStepEntry) {
  if (skills.length === 0)
    return true;
  const ref = skills.find((s) => s.id === skillId);
  if (!ref)
    return false;
  return (ref.depends_on ?? []).every((dep) => completedSinceStepEntry.has(dep));
}

// packages/automation/dist/types.js
var PHASE_EVENTS = ["build-complete", "verify-pass", "ship-complete"];
var AUTOMATION_LEVELS = ["L1", "L2", "L3"];
var DEFAULT_CONFIG = {
  enabled: false,
  defaultOptIn: false,
  maxParallel: 4,
  maxRetries: 1,
  level: "L1"
};

// packages/automation/dist/queue/state-machine.js
function settleSuccess(level) {
  return level === "L3" ? "merged" : "paused";
}
function settleFailure(kind, attemptsAfterIncr, maxRetries) {
  if (kind === "conflict")
    return "conflict";
  return attemptsAfterIncr > maxRetries ? "failed" : "queued";
}

// packages/automation/dist/queue/claim.js
var DAEMON_OWNED = ["running", "scheduled"];
async function markQueued(store2, changeDir2, clock) {
  await store2.setMany(changeDir2, { automation: "queued", automation_queued_at: clock() });
}
function claim(store2, changeDir2) {
  return store2.cas(changeDir2, "automation", "queued", "scheduled");
}
async function setAutomationOwned(store2, changeDir2, next) {
  if (await store2.cas(changeDir2, "automation", "running", next))
    return true;
  return store2.cas(changeDir2, "automation", "scheduled", next);
}
async function getAutomation(store2, changeDir2) {
  const v = await store2.get(changeDir2, "automation");
  return typeof v === "string" ? v : "";
}
function isSettled(automation) {
  return automation !== "" && !DAEMON_OWNED.includes(automation);
}
function incrAttempts(store2, changeDir2, max) {
  return store2.withLock(changeDir2, async () => {
    const state = await store2.read(changeDir2);
    const raw = state.fields.automation_attempts;
    const prev = Number(typeof raw === "string" ? raw : "0");
    const value = (Number.isFinite(prev) ? prev : 0) + 1;
    state.fields.automation_attempts = String(value);
    await store2.write(changeDir2, state);
    return { value, exhausted: value > max };
  });
}

// packages/automation/dist/queue/scan.js
import { readdir as readdir4 } from "node:fs/promises";
import { join as join14 } from "node:path";
var QUEUED_AT_LAST = "~";
var depsAllSatisfied = (deps, resolver) => {
  for (const dep of deps) {
    if (dep === "" || dep === "null")
      continue;
    if (!resolver.satisfied(dep))
      return false;
  }
  return true;
};
function readyCandidates(entries, resolver) {
  const ready = entries.filter((e) => e.phase === "build" && e.automation === "queued").filter((e) => depsAllSatisfied(e.dependsOn, resolver));
  const key = (e) => e.automationQueuedAt === "" || e.automationQueuedAt === "null" ? QUEUED_AT_LAST : e.automationQueuedAt;
  return ready.slice().sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka < kb)
      return -1;
    if (ka > kb)
      return 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  }).map((e) => e.name);
}
var scalar4 = (v) => typeof v === "string" ? v : "";
async function scanReadyFromFs(changesDir, store2) {
  let dirents;
  try {
    dirents = await readdir4(changesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const activeNames = dirents.filter((d) => d.isDirectory() && d.name !== "archive").map((d) => d.name);
  const entries = [];
  const automationByName = /* @__PURE__ */ new Map();
  for (const name2 of activeNames) {
    const changeDir2 = join14(changesDir, name2);
    let state;
    try {
      state = await store2.read(changeDir2);
    } catch {
      continue;
    }
    const automation = scalar4(state.fields.automation);
    automationByName.set(name2, automation);
    entries.push({
      name: name2,
      phase: scalar4(state.fields.phase),
      automation,
      automationQueuedAt: scalar4(state.fields.automation_queued_at),
      dependsOn: normalizeDeps(state.fields.depends_on)
    });
  }
  let archiveEntries = [];
  try {
    const archived = await readdir4(join14(changesDir, "archive"), { withFileTypes: true });
    archiveEntries = archived.filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    archiveEntries = [];
  }
  const resolver = {
    satisfied(dep) {
      const a = automationByName.get(dep);
      if (a !== void 0)
        return a === "merged";
      return archiveEntries.some((e) => e === dep || e.endsWith(`-${dep}`));
    }
  };
  return readyCandidates(entries, resolver);
}

// packages/automation/dist/queue/gate.js
var PIPELINE_AFK_ENV = "PIPELINE_AFK";
function optedIn(input) {
  if (input.track === "pm")
    return false;
  if (input.automation === "queued")
    return true;
  return input.defaultOptIn;
}
function shouldEnqueueOnSpecComplete(input) {
  if (!input.enabled)
    return false;
  return optedIn(input);
}

// packages/automation/dist/scheduler/semaphore.js
var createSemaphore = (maxParallel) => {
  if (maxParallel < 1)
    throw new Error("maxParallel must be >= 1");
  let running = 0;
  const queue = [];
  const acquire2 = () => {
    if (running < maxParallel) {
      running++;
      return Promise.resolve();
    }
    return new Promise((resolve10) => queue.push(resolve10));
  };
  const release2 = () => {
    if (running <= 0)
      return;
    running--;
    const next = queue.shift();
    if (next) {
      running++;
      next();
    }
  };
  return { acquire: acquire2, release: release2, running: () => running };
};

// packages/automation/dist/scheduler/classify.js
var TRANSIENT_EXEC_EXIT_CODES = /* @__PURE__ */ new Set([126, 137]);
var isVerifyFailSentinel = (e) => typeof e === "object" && e !== null && e.verifyFail === true;
var preservedPathOf = (err) => {
  if (err.preservedWorktreePath)
    return err.preservedWorktreePath;
  const m = err.message?.match(/preserved (?:at )?(.+?)\s*$/im);
  return m?.[1];
};
var classifyFailure = (err) => {
  if (isVerifyFailSentinel(err)) {
    return { kind: "retry", message: "verify-fail", cause: "verify-fail" };
  }
  const tagged = typeof err === "object" && err !== null ? err : {};
  const tag2 = tagged._tag;
  if (tag2 === "AbortedRunError" || tag2 === "CancelledRunError") {
    return {
      kind: "conflict",
      message: tagged.message ?? "aborted",
      cause: "cancelled",
      preservedPath: tagged.preservedPath ?? preservedPathOf(tagged)
    };
  }
  if (tag2 === "SyncError" || tag2 === "MergeToHostTimeoutError" || tag2 === "WorktreeError" || tag2 === "BarrierDriftError" || tag2 === "DenylistViolationError") {
    return {
      kind: "conflict",
      message: tagged.message ?? "merge conflict / barrier drift",
      cause: "conflict",
      preservedPath: preservedPathOf(tagged)
    };
  }
  if (tag2 === "AgentIdleTimeoutError") {
    return { kind: "retry", message: tagged.message ?? "agent idle timeout", cause: "timeout" };
  }
  const isTransient = tag2 === "ExecError" && typeof tagged.exitCode === "number" && TRANSIENT_EXEC_EXIT_CODES.has(tagged.exitCode);
  return {
    kind: "retry",
    message: tagged.message ?? (isTransient ? "transient exec failure" : err instanceof Error ? err.message : "run failed"),
    cause: ""
  };
};

// packages/automation/dist/scheduler/scheduler.js
var sanitizePath = (s) => s.replace(/[\r\n]+/g, " ").replace(/:\s/g, "; ").replace(/\s#/g, " ").replace(/^["']+/, "").trim() || "error";
var sanitize = (s) => sanitizePath(s).slice(0, 200).trim() || "error";
var createScheduler = (deps) => {
  const { state, runChange, registerShutdown, config } = deps;
  const observer = deps.observer;
  const semaphore = createSemaphore(config.maxParallel);
  const inFlight = /* @__PURE__ */ new Set();
  registerShutdown(() => {
    for (const name2 of inFlight) {
      try {
        state.markFailedSync(name2, "scheduler interrupted");
      } catch {
      }
    }
  });
  const emit3 = (name2, s, extra) => {
    if (!observer)
      return;
    try {
      observer.onState(name2, s, extra);
    } catch {
    }
  };
  const writeBackSuccess = async (name2, outcome) => {
    if (outcome.verifyResult === "fail") {
      return applyFailure(name2, { verifyFail: true });
    }
    const current = await state.getAutomation(name2).catch(() => "");
    if (isSettled(current))
      return "skipped";
    const noop = outcome.noop === true;
    const target = noop ? "paused" : settleSuccess(config.level);
    const won = await state.setAutomationOwned(name2, target);
    if (!won)
      return "skipped";
    if (noop) {
      await state.setField(name2, "automation_last_error", sanitize("no-op run\uFF1A\u96F6 commit / \u7A7A\u6784\u5EFA\uFF08build_sha \u7F3A\u5931\uFF09\u2014\u2014\u672A\u5408\u5E76\u3001\u672A\u89E3\u9501\u4E0B\u6E38\uFF0C\u505C\u7ED9\u4EBA\u5DE5\u590D\u6838"));
      await state.setField(name2, "automation_cause", "no-op");
    }
    await state.setField(name2, "automation_attempts", "0");
    return target;
  };
  const applyFailure = async (name2, err) => {
    const c = classifyFailure(err);
    const lastError = sanitize(c.message);
    const current = await state.getAutomation(name2).catch(() => "");
    if (isSettled(current))
      return "skipped";
    if (c.kind === "conflict") {
      const won2 = await state.setAutomationOwned(name2, "conflict");
      if (!won2)
        return "skipped";
      await state.setField(name2, "automation_last_error", lastError);
      await state.setField(name2, "automation_cause", c.cause);
      if (c.preservedPath)
        await state.setField(name2, "automation_preserved_path", sanitizePath(c.preservedPath));
      return "conflict";
    }
    const { value } = await state.incrAttempts(name2, config.maxRetries);
    const next = settleFailure("retry", value, config.maxRetries);
    const won = await state.setAutomationOwned(name2, next);
    if (!won)
      return "skipped";
    await state.setField(name2, "automation_last_error", lastError);
    await state.setField(name2, "automation_cause", c.cause);
    return next;
  };
  const emitTerminal = (name2, settled) => {
    if (settled === "skipped")
      return;
    emit3(name2, settled);
  };
  const handleOne = async (name2) => {
    const won = await state.claim(name2);
    if (!won)
      return;
    await semaphore.acquire();
    const controller = new AbortController();
    try {
      try {
        await state.setAutomation(name2, "running");
        emit3(name2, "running");
        inFlight.add(name2);
      } catch (err) {
        emitTerminal(name2, await applyFailure(name2, err));
        return;
      }
      try {
        const outcome = await runChange(name2, controller.signal);
        emitTerminal(name2, await writeBackSuccess(name2, outcome));
      } catch (err) {
        emitTerminal(name2, await applyFailure(name2, err));
      } finally {
        inFlight.delete(name2);
      }
    } finally {
      semaphore.release();
    }
  };
  const runRoundOnce = async (candidates) => {
    await Promise.allSettled(candidates.map((name2) => handleOne(name2)));
  };
  return { runRoundOnce };
};

// packages/automation/dist/lifecycle/barrier.js
var BarrierDriftError = class extends Error {
  name = "BarrierDriftError";
  _tag = "BarrierDriftError";
  constructor(message) {
    super(message);
  }
};
var deriveBarrierSha = async (input) => {
  const { git, branch, commits, sandboxReportedSha } = input;
  if (commits.length === 0)
    return { buildSha: void 0 };
  const landed = commits[commits.length - 1]?.sha;
  if (landed === void 0)
    return { buildSha: void 0 };
  let branchHead;
  try {
    branchHead = await git.revParse(`refs/heads/${branch}`);
  } catch (err) {
    throw new BarrierDriftError(`barrier: cannot resolve host branch ${branch} for build_sha: ${String(err)}`);
  }
  if (branchHead !== landed) {
    throw new BarrierDriftError(`barrier: named branch ${branch} HEAD=${branchHead} != landed build commit ${landed} (named-branch post-freeze drift \u2014 verify would target an unreviewed commit)`);
  }
  if (sandboxReportedSha && sandboxReportedSha.length === 40 && sandboxReportedSha !== branchHead) {
    throw new BarrierDriftError(`barrier: sandbox-reported build_sha=${sandboxReportedSha} diverges from the host-landed commit ${branchHead} (no moving-target verify-pass)`);
  }
  return { buildSha: branchHead };
};

// packages/automation/dist/lifecycle/denylist.js
var globToRegExp = (glob) => {
  let re = "";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 3;
        } else {
          re += ".*";
          i += 2;
        }
      } else {
        re += "[^/]*";
        i += 1;
      }
    } else if (c === "?") {
      re += "[^/]";
      i += 1;
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      i += 1;
    }
  }
  return new RegExp(`^${re}$`);
};
var matchDenylist = (files, globs) => {
  if (globs.length === 0)
    return [];
  const res = globs.map((g) => ({ glob: g, re: globToRegExp(g) }));
  const out = [];
  for (const file of files) {
    const hit = res.find((r) => r.re.test(file));
    if (hit)
      out.push({ file, glob: hit.glob });
  }
  return out;
};
var denylistForChange = (loops, name2) => {
  const out = [];
  for (const l of loops) {
    if (!l.change_prefix)
      continue;
    if (!name2.startsWith(l.change_prefix))
      continue;
    for (const g of l.denylist ?? []) {
      if (!out.includes(g))
        out.push(g);
    }
  }
  return out;
};
var DenylistViolationError = class extends Error {
  name = "DenylistViolationError";
  _tag = "DenylistViolationError";
  violations;
  preservedWorktreePath;
  constructor(violations, preservedWorktreePath) {
    const detail = violations.map((v) => `${v.file} (denylist: ${v.glob})`).join(", ");
    super(`run touched denylisted paths: ${detail}. Worktree PRESERVED at ${preservedWorktreePath}.`);
    this.violations = violations;
    this.preservedWorktreePath = preservedWorktreePath;
  }
};

// packages/automation/dist/lifecycle/transitionWatch.js
var TRANSITION_LINE_RE = /^\[TRANSITION\] (\S+): (\S+) -> (\S+)\s*$/;
var parseTransitionLine = (line) => {
  const m = TRANSITION_LINE_RE.exec(line);
  if (!m)
    return null;
  return { name: m[1], from: m[2], to: m[3] };
};
var createPhaseWatch = (name2, write) => {
  let last = "";
  let chain = Promise.resolve();
  const enqueue = (value) => {
    chain = chain.then(() => write(value)).catch(() => {
    });
  };
  return {
    onLine(line) {
      const t = parseTransitionLine(line);
      if (!t || t.name !== name2 || t.to === last)
        return;
      last = t.to;
      enqueue(t.to);
    },
    async settle() {
      if (last !== "") {
        last = "";
        enqueue("");
      }
      await chain;
    }
  };
};

// packages/automation/dist/lifecycle/lifecycle.js
var NAMED_BRANCH_PREFIX = "sandcastle-pipeline/";
var AbortedRunError = class extends Error {
  name = "AbortedRunError";
  _tag = "AbortedRunError";
  reason;
  preservedPath;
  constructor(reason, preservedPath) {
    super(typeof reason === "string" ? reason : reason?.message ?? String(reason));
    this.reason = reason;
    this.preservedPath = preservedPath;
  }
};
var CancelledRunError = class extends Error {
  name = "CancelledRunError";
  _tag = "CancelledRunError";
  preservedPath;
  constructor(reason, preservedPath) {
    super(reason);
    this.preservedPath = preservedPath;
  }
};
var PRESERVE_ERROR_TAGS = /* @__PURE__ */ new Set([
  "SyncError",
  "MergeToHostTimeoutError",
  "BarrierDriftError",
  "WorktreeError",
  "CancelledRunError",
  // 决议 #12：denylist 违规同 conflict 类——留现场供人工核对越界产出，绝不自动重试/merge。
  "DenylistViolationError"
]);
var isPreserveError = (err) => typeof err === "object" && err !== null && PRESERVE_ERROR_TAGS.has(err._tag ?? "");
var finalizeRunOutcome = (o) => ({ ...o, noop: !o.buildSha });
var AGENT_EXIT_LINE_RE = /^\[AGENT_EXIT\] (\S+) (\d+)\s*$/;
var createAgentExitWatch = (write) => {
  let wrote = false;
  let pending = Promise.resolve();
  return {
    onLine(line) {
      if (wrote)
        return;
      const m = AGENT_EXIT_LINE_RE.exec(line);
      if (!m || Number(m[2]) === 0)
        return;
      wrote = true;
      const runner = m[1];
      pending = write(`${runner} agent \u975E\u96F6\u9000\u51FA\uFF08exit ${m[2]}\uFF09\uFF1A\u53EF\u80FD\u51ED\u8BC1\u5931\u6548\u6216 ${runner} \u81EA\u8EAB\u62A5\u9519\uFF0C\u8BE6\u89C1 agent \u65E5\u5FD7`).catch(() => {
      });
    },
    /** 排空在途写（codex P2）：run 结算(finally)时 await——观察写严格先于 scheduler 终态分类落地，
     *  防延迟的 agent-exit 双字段写倒序覆盖 applyFailure 已落的权威成因(verify-fail/conflict)。 */
    async settle() {
      await pending;
    }
  };
};
var runChangeInSandbox = async (ports, cfg2, signal) => {
  const branch = `${NAMED_BRANCH_PREFIX}${cfg2.name}`;
  const wt = await ports.worktree.create(cfg2.hostRepoDir, branch);
  const worktreePath = wt.path;
  let handle;
  let preserve = false;
  const phaseWatch = createPhaseWatch(cfg2.name, (value) => ports.setStateField(cfg2.name, "automation_current_phase", value));
  const agentExitWatch = createAgentExitWatch(async (value) => {
    await ports.setStateField(cfg2.name, "automation_last_error", value);
    await ports.setStateField(cfg2.name, "automation_cause", "agent-exit");
  });
  try {
    const env = { ...cfg2.extraEnv, [PIPELINE_AFK_ENV]: "1" };
    handle = await ports.createSandbox({ env, worktreePath });
    const sandbox = handle;
    await ports.setStateField(cfg2.name, "automation_sandbox", sandbox.containerName).catch(() => {
    });
    await ports.setStateField(cfg2.name, "automation_worktree", worktreePath).catch(() => {
    });
    const report = await ports.runWork((cmd, options) => sandbox.exec(cmd, {
      ...options,
      onLine: (line) => {
        phaseWatch.onLine(line);
        agentExitWatch.onLine(line);
        options?.onLine?.(line);
      }
    }), cfg2.name, signal, cfg2.runner);
    if (await ports.worktree.hasCancelMarker(worktreePath)) {
      throw new CancelledRunError("cancel requested via dashboard", worktreePath);
    }
    if (signal.aborted)
      throw new AbortedRunError(signal.reason, worktreePath);
    const commits = await ports.collectCommits({ worktreePath, branch: wt.branch, base: cfg2.base });
    const denylist = cfg2.denylist ?? [];
    if (denylist.length > 0 && commits.length > 0) {
      const files = await ports.diffNames({ worktreePath, branch: wt.branch, base: cfg2.base });
      const violations = matchDenylist(files, denylist);
      if (violations.length > 0) {
        throw new DenylistViolationError(violations, worktreePath);
      }
    }
    const barrier = await deriveBarrierSha({
      git: ports.git,
      branch: wt.branch,
      commits,
      sandboxReportedSha: report.build_sha
    });
    if (cfg2.autoMerge && commits.length > 0) {
      await ports.mergeToBase({ worktreePath, branch: wt.branch, base: cfg2.base });
    }
    return finalizeRunOutcome({
      commits,
      verifyResult: report.verify_result,
      buildSha: barrier.buildSha,
      branch: wt.branch,
      phaseEvent: report.phase_event
    });
  } catch (err) {
    if (signal.aborted) {
      if (handle)
        await handle.close().catch(() => {
        });
      handle = void 0;
      throw new AbortedRunError(signal.reason, worktreePath);
    }
    let settled = err;
    if (!(err instanceof CancelledRunError) && await ports.worktree.hasCancelMarker(worktreePath)) {
      settled = new CancelledRunError("cancel requested via dashboard", worktreePath);
    }
    if (isPreserveError(settled))
      preserve = true;
    throw settled;
  } finally {
    await phaseWatch.settle().catch(() => {
    });
    await agentExitWatch.settle().catch(() => {
    });
    if (handle)
      await handle.close().catch(() => {
      });
    if (!signal.aborted && !preserve) {
      await ports.worktree.remove(worktreePath).catch(() => {
      });
    }
  }
};

// packages/automation/dist/lifecycle/runnerFor.js
var runnerForChange = (loops, name2) => {
  for (const l of loops) {
    if (!l.change_prefix)
      continue;
    if (!name2.startsWith(l.change_prefix))
      continue;
    return l.runner;
  }
  return void 0;
};

// packages/automation/dist/runner/runner.js
var StructuredOutputError = class extends Error {
  name = "StructuredOutputError";
  _tag = "StructuredOutputError";
  rawMatched;
  constructor(message, rawMatched) {
    super(message);
    this.rawMatched = rawMatched;
  }
};
var findLastOutputTag = (stdout) => {
  const re = /<output>\s*([\s\S]*?)\s*<\/output>/g;
  let last;
  for (let m = re.exec(stdout); m !== null; m = re.exec(stdout))
    last = m[1];
  return last;
};
var unwrapFences = (s) => {
  const t = s.trim();
  const fence = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return fence?.[1] !== void 0 ? fence[1].trim() : t;
};
var parseSandboxReport = (stdout) => {
  const raw = findLastOutputTag(stdout);
  if (raw === void 0) {
    throw new StructuredOutputError("sandbox produced no <output>{...}</output> report", "");
  }
  let parsed;
  try {
    parsed = JSON.parse(unwrapFences(raw));
  } catch (err) {
    throw new StructuredOutputError(`sandbox <output> is not valid JSON: ${String(err)}`, raw);
  }
  if (parsed.verify_result !== "pass" && parsed.verify_result !== "fail") {
    throw new StructuredOutputError('sandbox report missing/invalid verify_result (want "pass"|"fail")', raw);
  }
  const rawPhase = parsed.phase_event;
  const phase_event = typeof rawPhase === "string" && PHASE_EVENTS.includes(rawPhase) ? rawPhase : "verify-pass";
  const build_sha = typeof parsed.build_sha === "string" ? parsed.build_sha : void 0;
  const branch = typeof parsed.branch === "string" ? parsed.branch : void 0;
  return { verify_result: parsed.verify_result, build_sha, branch, phase_event };
};
var AFK_RUN_SCRIPT_SHA256 = "3d054050150f6b7dcde887b8cbfdfc8e1cf23457c48ce421fc0afbe9af650d90";
var AFK_RUN_DRIFT_EXIT_CODE = 95;
var AFK_RUN_DRIFT_GUARD = `sha256sum /usr/local/bin/pipeline-afk-run 2>/dev/null | grep -q "^${AFK_RUN_SCRIPT_SHA256} " || { echo "sandcastle \u955C\u50CF\u5185 pipeline-afk-run \u4E0E\u4ED3\u5E93 tools/sandcastle/pipeline-afk-run.sh \u4E0D\u4E00\u81F4\uFF08\u955C\u50CF\u9648\u65E7\u6216\u811A\u672C\u5DF2\u66F4\u65B0\u672A\u91CD\u5EFA\uFF09\u2014\u2014\u8BF7\u91CD\u5EFA\u955C\u50CF\uFF1Atools/sandcastle/build.sh" >&2; exit ${AFK_RUN_DRIFT_EXIT_CODE}; }`;
var buildAfkRunCommand = (name2, runner) => runner === "codex" ? `${AFK_RUN_DRIFT_GUARD}; PIPELINE_AFK=1 PIPELINE_RUNNER=codex pipeline-afk-run ${name2}` : `${AFK_RUN_DRIFT_GUARD}; PIPELINE_AFK=1 pipeline-afk-run ${name2}`;

// packages/automation/dist/runner/docker.js
var dockerAvailable = async (exec) => {
  try {
    const r = await exec("docker", ["info"]);
    return r.exitCode === 0;
  } catch {
    return false;
  }
};

// packages/automation/dist/config/automationJson.js
import { readFileSync as readFileSync11 } from "node:fs";
import { join as join15 } from "node:path";
var AUTOMATION_JSON_LIMITS = {
  maxParallel: { min: 1, max: 8 },
  maxRetries: { min: 0, max: 3 },
  imageMaxLen: 200
};
var AUTOMATION_IMAGE_RE = /^[a-zA-Z0-9._/:@-]+$/;
function automationJsonPath(root) {
  return join15(root, ".pipeline", "automation.json");
}
var intIn = (v, min, max) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
function isValidImageRef(v) {
  return v.length > 0 && v.length <= AUTOMATION_JSON_LIMITS.imageMaxLen && AUTOMATION_IMAGE_RE.test(v);
}
function readAutomationJson(root, fs = { readFileSync: readFileSync11 }) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(automationJsonPath(root), "utf8"));
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return {};
  const raw = parsed;
  const cfg2 = {};
  const { maxParallel: mp, maxRetries: mr } = AUTOMATION_JSON_LIMITS;
  if (intIn(raw.max_parallel, mp.min, mp.max))
    cfg2.maxParallel = raw.max_parallel;
  if (intIn(raw.max_retries, mr.min, mr.max))
    cfg2.maxRetries = raw.max_retries;
  if (typeof raw.default_opt_in === "boolean")
    cfg2.defaultOptIn = raw.default_opt_in;
  if (typeof raw.image === "string") {
    const image = raw.image.trim();
    if (isValidImageRef(image))
      cfg2.image = image;
  }
  return cfg2;
}

// packages/automation/dist/sdk/sdk.js
import { join as join16 } from "node:path";
var scalar5 = (v) => typeof v === "string" ? v : "";
var storeWriter = (store2, changeDir2) => ({
  claim: (name2) => claim(store2, changeDir2(name2)),
  setAutomation: (name2, s) => store2.set(changeDir2(name2), "automation", s),
  setField: (name2, field2, value) => store2.set(changeDir2(name2), field2, value),
  incrAttempts: (name2, max) => incrAttempts(store2, changeDir2(name2), max),
  getAutomation: (name2) => getAutomation(store2, changeDir2(name2)),
  setAutomationOwned: (name2, next) => setAutomationOwned(store2, changeDir2(name2), next),
  markFailedSync: (name2, reason) => {
    void store2.setMany(changeDir2(name2), { automation: "failed", automation_last_error: reason, automation_cause: "" }).catch(() => {
    });
  }
});
function createAutomation(deps) {
  const { image: _image, ...fileCfg } = readAutomationJson(deps.repoRoot, deps.configFs);
  const config = { ...DEFAULT_CONFIG, enabled: true, defaultOptIn: true, ...fileCfg, ...deps.config };
  const { store: store2, clock } = deps;
  const changesDir = join16(deps.repoRoot, "openspec", "changes");
  const changeDir2 = (name2) => join16(changesDir, name2);
  return {
    config,
    async enqueue(name2) {
      const state = await store2.read(changeDir2(name2));
      const eligible = shouldEnqueueOnSpecComplete({
        enabled: config.enabled,
        track: scalar5(state.fields.track),
        automation: scalar5(state.fields.automation),
        defaultOptIn: config.defaultOptIn
      });
      if (!eligible)
        return false;
      await markQueued(store2, changeDir2(name2), clock);
      return true;
    },
    scanReady() {
      return scanReadyFromFs(changesDir, store2);
    },
    async runRound(runChange) {
      const candidates = await scanReadyFromFs(changesDir, store2);
      const scheduler = createScheduler({
        state: storeWriter(store2, changeDir2),
        runChange,
        registerShutdown: () => () => {
        },
        config: { maxParallel: config.maxParallel, maxRetries: config.maxRetries, level: config.level }
      });
      await scheduler.runRoundOnce(candidates);
    }
  };
}

// packages/automation/dist/sdk/dockerRunChange.js
import { join as join20 } from "node:path";

// packages/automation/dist/lifecycle/ports.js
import { mkdir as mkdir8, writeFile as writeFile6 } from "node:fs/promises";
import { join as join19 } from "node:path";

// packages/automation/dist/runner/boundedTail.js
var MAX_TAIL_CHARS = 64 * 1024;
var BoundedTail = class {
  items = [];
  totalChars = 0;
  maxChars;
  separator;
  constructor(maxChars = MAX_TAIL_CHARS, separator = "") {
    this.maxChars = maxChars;
    this.separator = separator;
  }
  push(item) {
    const bounded = item.length > this.maxChars ? item.slice(item.length - this.maxChars) : item;
    this.totalChars += bounded.length + (this.items.length > 0 ? this.separator.length : 0);
    this.items.push(bounded);
    while (this.totalChars > this.maxChars && this.items.length > 1) {
      const dropped = this.items.shift();
      this.totalChars -= dropped.length + this.separator.length;
    }
  }
  toString() {
    return this.items.join(this.separator);
  }
};

// packages/automation/dist/runner/container.js
var KEEPALIVE_CMD = ["sleep", "2147483647"];
var formatVolumeMount = (m) => {
  const base = `${m.hostPath}:${m.sandboxPath}`;
  const options = [m.readonly ? "ro" : void 0, "z"].filter((o) => o !== void 0).join(",");
  return `${base}:${options}`;
};
var buildContainerRunArgs = (opts) => {
  const envFlags = Object.entries(opts.env ?? {}).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
  const volumeFlags = (opts.gitMounts ?? []).flatMap((m) => ["-v", formatVolumeMount(m)]);
  const userFlags = opts.uid !== void 0 && opts.gid !== void 0 ? ["--user", `${opts.uid}:${opts.gid}`] : [];
  const cpusFlags = opts.cpus !== void 0 ? ["--cpus", String(opts.cpus)] : [];
  const workdirFlags = opts.worktreePath ? ["-w", opts.worktreePath] : [];
  return [
    "run",
    "-d",
    "--name",
    opts.name,
    ...envFlags,
    ...volumeFlags,
    ...userFlags,
    ...cpusFlags,
    ...workdirFlags,
    opts.image
    // image 末位（buildContainerRunArgs 契约；保活命令由 startContainer 追加）
  ];
};
var buildExecArgs = (name2, command, opts) => {
  const cwdFlags = opts?.cwd ? ["-w", opts.cwd] : [];
  return ["exec", ...cwdFlags, name2, "sh", "-c", command];
};
var startContainer = async (exec, opts) => {
  const args = [...buildContainerRunArgs(opts), ...KEEPALIVE_CMD];
  const r = await exec("docker", args);
  if (r.exitCode !== 0) {
    throw new Error(`docker run ${opts.image} failed (exit ${r.exitCode}): ${r.stderr.slice(0, 300)}`);
  }
  return opts.name;
};
var execInContainer = (exec, name2, command, opts) => exec("docker", buildExecArgs(name2, command, { cwd: opts?.cwd }), { onLine: opts?.onLine });
var removeContainer = async (exec, name2) => {
  await exec("docker", ["stop", name2]).catch(() => {
  });
  await exec("docker", ["rm", name2]).catch(() => {
  });
};
var createDockerSandbox = async (exec, opts) => {
  const name2 = `sandcastle-${randomName()}`;
  await startContainer(exec, {
    name: name2,
    image: opts.image,
    env: opts.env,
    gitMounts: opts.gitMounts,
    worktreePath: opts.worktreePath,
    uid: opts.uid,
    gid: opts.gid,
    cpus: opts.cpus
  });
  return {
    env: opts.env,
    containerName: name2,
    exec: (cmd, options) => execInContainer(exec, name2, cmd, { cwd: opts.worktreePath, onLine: options?.onLine }),
    close: () => removeContainer(exec, name2)
  };
};
var randomName = () => `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;

// packages/automation/dist/runner/gitMounts.js
import { readFile as fsReadFile, stat as fsStat } from "node:fs/promises";
import { resolve as resolve5 } from "node:path";
var resolveGitMounts = async (gitPath, deps) => {
  const stat9 = deps?.stat ?? ((p) => fsStat(p));
  const readFile8 = deps?.readFile ?? ((p) => fsReadFile(p, "utf-8"));
  const s = await stat9(gitPath);
  if (s.isDirectory()) {
    return [{ hostPath: gitPath, sandboxPath: gitPath }];
  }
  const content = (await readFile8(gitPath)).trim();
  const match = content.match(/^gitdir:\s*(.+)$/);
  if (!match) {
    return [{ hostPath: gitPath, sandboxPath: gitPath }];
  }
  const gitdirPath = match[1];
  const parentGitDir = resolve5(gitdirPath, "..", "..");
  return [
    { hostPath: gitPath, sandboxPath: gitPath },
    { hostPath: parentGitDir, sandboxPath: parentGitDir }
  ];
};

// packages/automation/dist/runner/race.js
var DEFAULT_COMPLETION_SIGNAL = "<promise>COMPLETE</promise>";
var DEFAULT_IDLE_TIMEOUT_MS = 20 * 60 * 1e3;
var DEFAULT_COMPLETION_TIMEOUT_MS = 60 * 1e3;
var AgentIdleTimeoutError = class extends Error {
  name = "AgentIdleTimeoutError";
  _tag = "AgentIdleTimeoutError";
};
var detectsCompletion = (accumulated, signals) => signals.some((sig) => accumulated.includes(sig));
var armDecision = (completionDetected, idleMs, graceMs) => completionDetected ? { ms: graceMs, onExpiry: "resolve" } : { ms: idleMs, onExpiry: "reject-idle" };
var invokeWithRace = (runExec, opts) => new Promise((resolve10, reject) => {
  const { idleMs, graceMs, completionSignals, signal } = opts;
  let settled = false;
  let accumulated = "";
  let completionDetected = false;
  let timer = null;
  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const cleanup2 = () => {
    clear();
    if (onAbort && signal)
      signal.removeEventListener("abort", onAbort);
  };
  const settleResolve = (v) => {
    if (settled)
      return;
    settled = true;
    cleanup2();
    resolve10(v);
  };
  const settleReject = (e) => {
    if (settled)
      return;
    settled = true;
    cleanup2();
    reject(e);
  };
  const resetTimer = () => {
    clear();
    const d = armDecision(completionDetected, idleMs, graceMs);
    timer = setTimeout(() => {
      if (d.onExpiry === "resolve")
        settleResolve({ stdout: accumulated, stderr: "", exitCode: 0 });
      else
        settleReject(new AgentIdleTimeoutError(`Agent idle for ${idleMs / 1e3}s \u2014 no output received.`));
    }, d.ms);
    timer.unref?.();
  };
  let onAbort;
  if (signal) {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    onAbort = () => settleReject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  }
  resetTimer();
  const onLine = (line) => {
    if (settled)
      return;
    accumulated += (accumulated ? "\n" : "") + line;
    if (!completionDetected && detectsCompletion(accumulated, completionSignals)) {
      completionDetected = true;
    }
    resetTimer();
  };
  runExec(onLine).then((res) => {
    if (settled)
      return;
    settleResolve(res);
  }).catch((err) => settleReject(err));
});

// packages/automation/dist/lifecycle/mergeback.js
import { mkdir as mkdir7, rmdir as rmdir2, stat as stat6 } from "node:fs/promises";
import { join as join18, resolve as resolve6 } from "node:path";

// packages/automation/dist/lifecycle/worktree.js
import { access, mkdir as mkdir6 } from "node:fs/promises";
import { join as join17 } from "node:path";
var NO_CONFIG_LOCK_FLAGS = [
  "-c",
  "branch.autoSetupMerge=false",
  "-c",
  "push.autoSetupRemote=false"
];
var GIT_ENV = { LC_ALL: "C" };
var WorktreeError = class extends Error {
  name = "WorktreeError";
  _tag = "WorktreeError";
};
var worktreePathFor = (repoDir, branch) => join17(repoDir, ".sandcastle", "worktrees", branch.replace(/\//g, "-"));
var addWorktree = async (exec, repoDir, branch) => {
  await mkdir6(join17(repoDir, ".sandcastle", "worktrees"), { recursive: true });
  const path6 = worktreePathFor(repoDir, branch);
  const created = await exec("git", [...NO_CONFIG_LOCK_FLAGS, "worktree", "add", "-b", branch, path6, "HEAD"], { cwd: repoDir, env: GIT_ENV });
  if (created.exitCode === 0)
    return { path: path6, branch };
  const reused = await exec("git", [...NO_CONFIG_LOCK_FLAGS, "worktree", "add", path6, branch], {
    cwd: repoDir,
    env: GIT_ENV
  });
  if (reused.exitCode === 0)
    return { path: path6, branch };
  throw new WorktreeError(`git worktree add failed for '${branch}': ${(reused.stderr || created.stderr).slice(0, 300)}`);
};
var removeWorktree = async (exec, path6) => {
  const repoDir = join17(path6, "..", "..", "..");
  const r = await exec("git", ["worktree", "remove", "--force", path6], { cwd: repoDir, env: GIT_ENV });
  if (r.exitCode !== 0) {
    await exec("git", ["worktree", "prune"], { cwd: repoDir, env: GIT_ENV }).catch(() => {
    });
  }
};
var CANCEL_MARKER_FILE = ".cancel-requested";
var hasCancelMarker = async (worktreePath) => access(join17(worktreePath, CANCEL_MARKER_FILE)).then(() => true, () => false);
var realWorktreePort = (exec) => ({
  create: (repoDir, branch) => addWorktree(exec, repoDir, branch),
  remove: (path6) => removeWorktree(exec, path6),
  hasCancelMarker: (path6) => hasCancelMarker(path6)
});

// packages/automation/dist/lifecycle/mergeback.js
var GIT_ENV2 = { LC_ALL: "C" };
var LOCK_TIMEOUT_MS2 = 3e5;
var LOCK_STALE_MS = 12e4;
var LOCK_POLL_MS = 25;
var sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
var SyncError = class extends Error {
  name = "SyncError";
  _tag = "SyncError";
  preservedWorktreePath;
  constructor(message, preservedWorktreePath) {
    super(message);
    this.preservedWorktreePath = preservedWorktreePath;
  }
};
var parseMergeResult = (r) => ({
  conflict: r.exitCode !== 0
});
var realGitFace = (exec, cwd) => ({
  async revParse(ref) {
    const r = await exec("git", ["rev-parse", ref], { cwd, env: GIT_ENV2 });
    if (r.exitCode !== 0)
      throw new Error(`git rev-parse ${ref} failed: ${r.stderr.slice(0, 200)}`);
    return r.stdout.trim();
  }
});
var collectCommitsReal = async (exec, input) => {
  const r = await exec("git", ["rev-list", `${input.base}..refs/heads/${input.branch}`, "--reverse"], { cwd: input.hostRepoDir, env: GIT_ENV2 });
  if (r.exitCode !== 0)
    return [];
  const lines = r.stdout.trim();
  if (!lines)
    return [];
  return lines.split("\n").map((sha) => ({ sha: sha.trim() }));
};
var diffNamesReal = async (exec, input) => {
  const r = await exec(
    "git",
    // B6：git 默认 core.quotePath=true，非 ASCII 路径输出成 "\346..." 八进制转义双引号串，下游
    // denylist glob 匹配不到 → 中文/emoji 文件名越界产出逃检（L3 自动 merge）。-c core.quotePath=false
    // 关掉转义 → 输出 literal UTF-8 路径，denylist 真命中。
    ["-c", "core.quotePath=false", "diff", "--name-only", `${input.base}...refs/heads/${input.branch}`],
    { cwd: input.hostRepoDir, env: GIT_ENV2 }
  );
  if (r.exitCode !== 0)
    return [];
  const lines = r.stdout.trim();
  if (!lines)
    return [];
  return lines.split("\n").map((f) => f.trim()).filter((f) => f !== "");
};
var resolveLockDir = async (exec, hostRepoDir) => {
  const r = await exec("git", ["rev-parse", "--git-common-dir"], { cwd: hostRepoDir, env: GIT_ENV2 });
  const out = r.exitCode === 0 ? r.stdout.trim() : ".git";
  return join18(resolve6(hostRepoDir, out || ".git"), "sandcastle-mergeback.lock.d");
};
var acquireMergeLock = async (exec, hostRepoDir, preservedPath) => {
  const lockdir = await resolveLockDir(exec, hostRepoDir);
  const deadline = Date.now() + LOCK_TIMEOUT_MS2;
  for (; ; ) {
    try {
      await mkdir7(lockdir, { recursive: false });
      return lockdir;
    } catch {
      try {
        const s = await stat6(lockdir);
        if (Date.now() - s.mtimeMs > LOCK_STALE_MS)
          await rmdir2(lockdir).catch(() => {
          });
      } catch {
      }
      if (Date.now() >= deadline) {
        throw new SyncError(`host merge-back lock not acquired within ${LOCK_TIMEOUT_MS2}ms (${lockdir})`, preservedPath);
      }
      await sleep2(LOCK_POLL_MS);
    }
  }
};
var mergeBackToBase = async (exec, input) => {
  const { hostRepoDir, worktreePath, branch, base } = input;
  const headRef = await exec("git", ["symbolic-ref", "HEAD"], { cwd: hostRepoDir, env: GIT_ENV2 });
  const head = headRef.exitCode === 0 ? headRef.stdout.trim() : "";
  const headShort = head.replace(/^refs\/heads\//, "");
  const baseShort = base.replace(/^refs\/heads\//, "");
  if (headShort === "" || headShort !== baseShort) {
    throw new SyncError(`host repo HEAD is '${head || "(detached)"}' but merge target base is '${base}' \u2014 refusing to merge '${branch}' into the wrong branch. The named branch and worktree are PRESERVED at ${worktreePath}. To recover: check out '${base}' in the host repo (${hostRepoDir}) and re-run.`, worktreePath);
  }
  const lock = await acquireMergeLock(exec, hostRepoDir, worktreePath);
  try {
    const merge = await exec("git", [...NO_CONFIG_LOCK_FLAGS, "merge", "--no-edit", `refs/heads/${branch}`], { cwd: hostRepoDir, env: GIT_ENV2 });
    if (parseMergeResult(merge).conflict) {
      await exec("git", ["merge", "--abort"], { cwd: hostRepoDir, env: GIT_ENV2 }).catch(() => {
      });
      throw new SyncError(`Merge of '${branch}' into base '${base}' failed (conflict). The named branch '${branch}' and worktree are PRESERVED at ${worktreePath}. To retry: cd ${worktreePath} && git merge ${base} (resolve conflicts manually, then commit).`, worktreePath);
    }
  } finally {
    await rmdir2(lock).catch(() => {
    });
  }
};

// packages/automation/dist/lifecycle/ports.js
var createLifecyclePorts = (deps) => {
  const { exec, hostRepoDir } = deps;
  const image = deps.image ?? "sandcastle:local";
  const uid = deps.uid ?? process.getuid?.();
  const gid = deps.gid ?? process.getgid?.();
  const idleMs = deps.idleMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const graceMs = deps.graceMs ?? DEFAULT_COMPLETION_TIMEOUT_MS;
  const completionSignals = deps.completionSignals ?? [DEFAULT_COMPLETION_SIGNAL];
  return {
    worktree: realWorktreePort(exec),
    async createSandbox({ env, worktreePath }) {
      const gitMounts = await resolveGitMounts(join19(worktreePath, ".git")).catch(() => []);
      const dotGit = join19(worktreePath, ".git");
      const parentGitMounts = gitMounts.filter((m) => m.hostPath !== dotGit);
      const codexHome = env.CODEX_HOME;
      const codexHomeMounts = codexHome !== void 0 && codexHome.startsWith("/") ? [{ hostPath: codexHome, sandboxPath: codexHome }] : [];
      const mounts = [{ hostPath: worktreePath, sandboxPath: worktreePath }, ...parentGitMounts, ...codexHomeMounts];
      return createDockerSandbox(exec, { image, worktreePath, env, gitMounts: mounts, uid, gid, cpus: deps.cpus });
    },
    async runWork(sandboxExec, name2, signal, runner) {
      const cmd = buildAfkRunCommand(name2, runner);
      const changeDir2 = join19(hostRepoDir, "openspec", "changes", name2);
      const logPath = join19(changeDir2, ".sandcastle-run.log");
      const persistLog = async (content) => {
        await mkdir8(changeDir2, { recursive: true }).catch(() => {
        });
        await writeFile6(logPath, content, "utf8").catch(() => {
        });
      };
      const fallbackTail = new BoundedTail(MAX_TAIL_CHARS, "\n");
      let res;
      try {
        res = await invokeWithRace((onLine) => sandboxExec(cmd, {
          onLine: (line) => {
            fallbackTail.push(line);
            onLine(line);
          }
        }), { idleMs, graceMs, completionSignals, signal });
      } catch (err) {
        await persistLog(fallbackTail.toString());
        throw err;
      }
      const fullLog = [res.stdout, res.stderr].filter((s) => s.length > 0).join("\n");
      await persistLog(fullLog);
      if (res.exitCode !== 0) {
        throw new Error(`pipeline afk-run failed (exit ${res.exitCode}): ${res.stderr.slice(0, 200)}`);
      }
      return parseSandboxReport(res.stdout);
    },
    collectCommits: (input) => collectCommitsReal(exec, { hostRepoDir, branch: input.branch, base: input.base }),
    // T4 决议 #12：denylist 结算检查的数据源（同 collectCommits 从 hostRepoDir 读不可变命名 ref）。
    diffNames: (input) => diffNamesReal(exec, { hostRepoDir, branch: input.branch, base: input.base }),
    mergeToBase: (input) => mergeBackToBase(exec, { hostRepoDir, worktreePath: input.worktreePath, branch: input.branch, base: input.base }),
    git: realGitFace(exec, hostRepoDir),
    setStateField: deps.setStateField ?? (async () => {
    })
  };
};

// packages/automation/dist/runner/exec.js
import { execFile, spawn as spawn2 } from "node:child_process";
import { createInterface } from "node:readline";
var mergedEnv = (env) => env ? { ...process.env, ...env } : process.env;
var spawnStreaming = (file, args, opts) => new Promise((resolve10) => {
  const maxTail = opts.maxTailChars ?? MAX_TAIL_CHARS;
  const proc = spawn2(file, args, {
    cwd: opts.cwd,
    env: mergedEnv(opts.env),
    stdio: [opts.input !== void 0 ? "pipe" : "ignore", "pipe", "pipe"]
  });
  if (opts.input !== void 0 && proc.stdin) {
    proc.stdin.write(opts.input);
    proc.stdin.end();
  }
  const stdoutTail = new BoundedTail(maxTail, "\n");
  const stderrTail = new BoundedTail(maxTail, opts.onLine ? "\n" : "");
  if (opts.onLine && proc.stdout) {
    const rl = createInterface({ input: proc.stdout });
    rl.on("line", (line) => {
      stdoutTail.push(line);
      opts.onLine?.(line);
    });
  } else {
    proc.stdout?.on("data", (chunk) => stdoutTail.push(chunk.toString()));
  }
  if (opts.onLine && proc.stderr) {
    const rlErr = createInterface({ input: proc.stderr });
    rlErr.on("line", (line) => {
      stderrTail.push(line);
      opts.onLine?.(line);
    });
  } else {
    proc.stderr?.on("data", (chunk) => stderrTail.push(chunk.toString()));
  }
  proc.on("error", (err) => {
    stderrTail.push(String(err.message ?? err));
    resolve10({ stdout: stdoutTail.toString(), stderr: stderrTail.toString(), exitCode: 127 });
  });
  proc.on("close", (code) => {
    resolve10({ stdout: stdoutTail.toString(), stderr: stderrTail.toString(), exitCode: code ?? 0 });
  });
});
var nodeExec = (file, args, opts) => {
  if (opts?.onLine || opts?.input !== void 0)
    return spawnStreaming(file, args, opts);
  return new Promise((resolve10) => {
    execFile(file, args, { cwd: opts?.cwd, env: mergedEnv(opts?.env), maxBuffer: 64 * 1024 * 1024, encoding: "utf-8" }, (error, stdout, stderr) => {
      const code = error && typeof error.code === "number" ? error.code : error ? 1 : 0;
      resolve10({ stdout: String(stdout), stderr: String(stderr), exitCode: code });
    });
  });
};

// packages/automation/dist/sdk/dockerRunChange.js
var codexCredentialEnv = (hostEnv) => {
  const out = {};
  if (hostEnv.OPENAI_API_KEY !== void 0 && hostEnv.OPENAI_API_KEY !== "")
    out.OPENAI_API_KEY = hostEnv.OPENAI_API_KEY;
  if (hostEnv.CODEX_HOME !== void 0 && hostEnv.CODEX_HOME !== "")
    out.CODEX_HOME = hostEnv.CODEX_HOME;
  return out;
};
var claudeCredentialEnv = (hostEnv) => {
  const out = {};
  if (hostEnv.CLAUDE_CODE_OAUTH_TOKEN !== void 0 && hostEnv.CLAUDE_CODE_OAUTH_TOKEN !== "") {
    out.CLAUDE_CODE_OAUTH_TOKEN = hostEnv.CLAUDE_CODE_OAUTH_TOKEN;
  }
  return out;
};
var createDockerRunChange = (opts) => {
  const exec = opts.exec ?? nodeExec;
  const { store: store2, hostRepoDir } = opts;
  const changeDir2 = (name2) => join20(hostRepoDir, "openspec", "changes", name2);
  const setStateField = store2 ? (name2, field2, value) => store2.set(changeDir2(name2), field2, field2 === "automation_worktree" ? sanitizePath(value) : value) : void 0;
  const ports = createLifecyclePorts({
    exec,
    hostRepoDir: opts.hostRepoDir,
    image: opts.image,
    uid: opts.uid,
    gid: opts.gid,
    cpus: opts.cpus,
    idleMs: opts.idleMs,
    graceMs: opts.graceMs,
    setStateField
  });
  const autoMerge = opts.level === "L3";
  return async (name2, signal) => {
    const denylist = opts.resolveDenylist ? await opts.resolveDenylist(name2).catch(() => []) : [];
    const runner = opts.resolveRunner ? await opts.resolveRunner(name2).catch(() => void 0) : void 0;
    const hostEnv = opts.hostEnv ?? process.env;
    const credEnv = runner === "codex" ? codexCredentialEnv(hostEnv) : claudeCredentialEnv(hostEnv);
    const extraEnv = { ...credEnv, ...opts.extraEnv };
    return runChangeInSandbox(ports, { hostRepoDir: opts.hostRepoDir, name: name2, base: opts.base, autoMerge, extraEnv, denylist, runner }, signal);
  };
};

// packages/tap/dist/paths.js
import { homedir as homedir3, tmpdir } from "node:os";
import { mkdirSync as mkdirSync2 } from "node:fs";
import { join as join21, dirname as dirname5, resolve as resolve7 } from "node:path";
function safeHome() {
  const h = homedir3();
  if (h && h.length > 0)
    return h;
  const uid = typeof process.getuid === "function" ? String(process.getuid()) : "nouid";
  const base = join21(tmpdir(), `pipeline-tap-${uid}`);
  try {
    mkdirSync2(base, { recursive: true, mode: 448 });
  } catch {
  }
  return base;
}
function resolveTapDir(opts = {}) {
  if (opts.dir)
    return resolve7(opts.dir);
  const env = opts.env ?? process.env;
  const explicit = (env.PIPELINE_TAP_DIR ?? "").trim();
  if (explicit)
    return resolve7(explicit);
  const db = (env.PIPELINE_TAP_DB ?? "").trim();
  if (db)
    return resolve7(dirname5(resolve7(db)));
  const xdg = (env.XDG_DATA_HOME ?? "").trim();
  if (xdg)
    return resolve7(join21(xdg, "pipeline-tap"));
  return resolve7(join21(safeHome(), ".local", "share", "pipeline-tap"));
}
function resolveStateDir(opts = {}) {
  if (opts.dir)
    return resolve7(opts.dir);
  const env = opts.env ?? process.env;
  const override = (env.PIPELINE_TAP_STATE_DIR ?? "").trim();
  if (override)
    return resolve7(override);
  return resolveTapDir(opts);
}

// packages/tap/dist/record.js
var HOP_BY_HOP = /* @__PURE__ */ new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "host",
  "accept-encoding"
]);
var SENSITIVE_HEADER_KEYS = /* @__PURE__ */ new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "set-cookie2",
  "x-api-key",
  "x-amz-security-token",
  "x-goog-api-key",
  "api-key",
  "x-goog-iam-authorization-token",
  "x-goog-user-project",
  "proxy-authorization"
]);
var PREFIX_REDACTED_HEADER_KEYS = /* @__PURE__ */ new Set(["authorization", "x-api-key"]);
var SENSITIVE_BODY_KEYS = /* @__PURE__ */ new Set([
  "refresh_token",
  "access_token",
  "id_token",
  "client_secret",
  "api_key",
  "apikey",
  "code_verifier",
  "password",
  "secret",
  "session_key",
  "private_key",
  "authorization",
  // 纵深补充（对抗复审 I2）：裸 token / 连字符变体 / session / bearer / cookie 回显。client_id 是公开值不入，免误伤。
  "token",
  "session_token",
  "access-token",
  "refresh-token",
  "session-token",
  "bearer",
  "cookie",
  "set-cookie"
]);
var CRED_KEYS_ALT = [...SENSITIVE_BODY_KEYS].join("|");
var CRED_FORM_RE = new RegExp(`\\b(${CRED_KEYS_ALT})=([^&\\s]+)`, "gi");
var CRED_JSON_STR_RE = new RegExp(`("(?:${CRED_KEYS_ALT})"\\s*:\\s*)"[^"]*"`, "gi");
function redactSecretsInString(s) {
  return s.replace(CRED_FORM_RE, "$1=***").replace(CRED_JSON_STR_RE, '$1"***"');
}
var QUERY_SENSITIVE_PARAMS = /* @__PURE__ */ new Set([
  "key",
  "api_key",
  "apikey",
  "access_token",
  "refresh_token",
  "id_token",
  "token",
  "session_token",
  "client_secret",
  "password",
  "code",
  "code_verifier",
  "secret"
]);
function redactPathQuery(rawPath) {
  const qIdx = rawPath.indexOf("?");
  if (qIdx < 0)
    return rawPath;
  const base = rawPath.slice(0, qIdx);
  const query = rawPath.slice(qIdx + 1);
  const redacted = query.replace(/([^&=?#]+)=([^&#]*)/g, (m, k, _v) => {
    let name2 = k;
    try {
      name2 = decodeURIComponent(k);
    } catch {
    }
    return QUERY_SENSITIVE_PARAMS.has(name2.toLowerCase()) ? `${k}=***` : m;
  });
  return `${base}?${redacted}`;
}
function maskSecretValue(v, depth = 0) {
  if (typeof v === "string")
    return v === "" ? "" : "***";
  if (depth > 40 || v === null || typeof v !== "object")
    return v;
  if (Array.isArray(v))
    return v.map((x) => maskSecretValue(x, depth + 1));
  const out = {};
  for (const [k, val] of Object.entries(v))
    out[k] = maskSecretValue(val, depth + 1);
  return out;
}
function redactBodySecrets(value, depth = 0) {
  if (typeof value === "string")
    return redactSecretsInString(value);
  if (depth > 40 || value === null || typeof value !== "object")
    return value;
  if (Array.isArray(value))
    return value.map((v) => redactBodySecrets(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_BODY_KEYS.has(k.toLowerCase()) ? maskSecretValue(v) : redactBodySecrets(v, depth + 1);
  }
  return out;
}
function headerValueToString(v) {
  return Array.isArray(v) ? v.join(", ") : v ?? "";
}
function filterHeaders(headers, opts = {}) {
  const out = {};
  for (const [key, rawVal] of Object.entries(headers)) {
    const lowered = key.toLowerCase();
    if (HOP_BY_HOP.has(lowered))
      continue;
    const value = headerValueToString(rawVal);
    if (opts.redactKeys && SENSITIVE_HEADER_KEYS.has(lowered)) {
      if (PREFIX_REDACTED_HEADER_KEYS.has(lowered) && value.length > 12) {
        out[key] = value.slice(0, 12) + "...";
      } else {
        out[key] = "***";
      }
    } else {
      out[key] = value;
    }
  }
  return out;
}
function buildRecord(p) {
  const record = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    request_id: p.reqId,
    turn: p.turn,
    duration_ms: p.durationMs,
    transport: p.transport ?? "reverse",
    request: {
      method: p.method,
      // path 含 query（forward 的 pathname+search / reverse 的 req.url）：query 里的凭证（?access_token=…、
      // ?api_key=…、?key=… Google 式、?code=… OAuth）同样会随 trace 入库，按参数名脱敏（I1 + codex review：
      // `key`/`code` 只在 query 段按名精确遮，不进 body 白名单免误伤）。path 段与非敏感参数原样。
      path: redactPathQuery(p.path),
      headers: filterHeaders(p.reqHeaders, { redactKeys: true }),
      body: redactBodySecrets(p.reqBody)
    },
    response: {
      status: p.status,
      headers: filterHeaders(p.respHeaders, { redactKeys: true }),
      body: redactBodySecrets(p.respBody)
    }
  };
  if (p.sseEvents && p.sseEvents.length)
    record.response.sse_events = redactBodySecrets(p.sseEvents);
  if (p.upstreamBaseUrl)
    record.upstream_base_url = p.upstreamBaseUrl;
  return record;
}
function safeJson(raw) {
  if (raw == null)
    return null;
  const buf = typeof raw === "string" ? Buffer.from(raw, "utf8") : raw;
  if (buf.length === 0)
    return null;
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    return buf.toString("utf8");
  }
}
var TurnCounter = class {
  n;
  constructor(initial = 0) {
    this.n = initial;
  }
  next() {
    this.n += 1;
    return this.n;
  }
};
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var SESSION_IN_STRING_RE = /session_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
function looksLikeUuid(s) {
  return UUID_RE.test(s);
}
function extractRealSessionId(headers, bodyBytes, fallback) {
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === "x-claude-code-session-id") {
      const val = headerValueToString(v).trim();
      if (looksLikeUuid(val))
        return val;
      break;
    }
  }
  if (bodyBytes && bodyBytes.length) {
    try {
      const body = JSON.parse(bodyBytes.toString("utf8"));
      if (body && typeof body === "object") {
        const meta = body.metadata;
        if (meta && typeof meta === "object") {
          const uid = meta.user_id;
          if (typeof uid === "string") {
            const m = SESSION_IN_STRING_RE.exec(uid);
            if (m)
              return m[1];
          }
          const nested = meta.session_id;
          if (typeof nested === "string" && looksLikeUuid(nested.trim()))
            return nested.trim();
        }
      }
    } catch {
    }
  }
  return fallback;
}
var IGNORED_HOSTS = /* @__PURE__ */ new Set([
  "registry.npmjs.org",
  "registry.yarnpkg.com",
  "registry.npmmirror.com",
  "npm.pkg.github.com"
]);
var IGNORED_PATH_PREFIXES = ["/-/npm"];
var PKG_UA_MARKERS = ["npm/", "yarn/", "pnpm/", "bun/"];
var IGNORED_PKG_METADATA_CTYPES = /* @__PURE__ */ new Set(["application/json", "application/vnd.npm.install-v1+json"]);
function shouldSkipTraceRecord(p) {
  let hostname = "";
  try {
    hostname = new URL(p.upstreamUrl).hostname.toLowerCase();
  } catch {
    hostname = "";
  }
  if (IGNORED_HOSTS.has(hostname))
    return true;
  const cleanPath = (p.path || "/").split("?", 1)[0].toLowerCase();
  if (IGNORED_PATH_PREFIXES.some((pre) => cleanPath === pre || cleanPath.startsWith(pre + "/")))
    return true;
  const media = headerValueToString(headerLookup(p.responseHeaders, "content-type")).split(";", 1)[0].trim().toLowerCase();
  const ua = headerValueToString(headerLookup(p.requestHeaders ?? {}, "user-agent")).toLowerCase();
  const method = (p.method ?? "GET").toUpperCase();
  if ((method === "GET" || method === "HEAD") && PKG_UA_MARKERS.some((m) => ua.includes(m)) && IGNORED_PKG_METADATA_CTYPES.has(media)) {
    return true;
  }
  return false;
}
function headerLookup(headers, name2) {
  const lower = name2.toLowerCase();
  for (const [k, v] of Object.entries(headers))
    if (k.toLowerCase() === lower)
      return v;
  return void 0;
}

// packages/tap/dist/trace-store.js
import { appendFileSync as appendFileSync2, existsSync as existsSync6, mkdirSync as mkdirSync3, readFileSync as readFileSync12, readdirSync as readdirSync3, renameSync as renameSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join22 } from "node:path";
import { randomUUID } from "node:crypto";
function resolveTraceDir(opts = {}) {
  return resolveTapDir(opts);
}
function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
var FileTraceStore = class {
  dir;
  sessionsDir;
  recordsDir;
  constructor(dir) {
    this.dir = dir;
    this.sessionsDir = join22(dir, "sessions");
    this.recordsDir = join22(dir, "records");
    mkdirSync3(this.sessionsDir, { recursive: true });
    mkdirSync3(this.recordsDir, { recursive: true });
  }
  sessionFile(id) {
    return join22(this.sessionsDir, `${encodeURIComponent(id)}.json`);
  }
  recordsFile(id) {
    return join22(this.recordsDir, `${encodeURIComponent(id)}.jsonl`);
  }
  writeSession(row) {
    const tmp = this.sessionFile(row.id) + ".tmp";
    writeFileSync2(tmp, JSON.stringify(row), "utf8");
    renameSync2(tmp, this.sessionFile(row.id));
  }
  loadSessionRow(id) {
    const f = this.sessionFile(id);
    if (!existsSync6(f))
      return null;
    try {
      return JSON.parse(readFileSync12(f, "utf8"));
    } catch {
      return null;
    }
  }
  createSession(opts = {}) {
    const id = randomUUID();
    const now = opts.startedAt ?? /* @__PURE__ */ new Date();
    const iso = now.toISOString();
    this.writeSession({
      id,
      started_at: iso,
      updated_at: iso,
      date_key: localDateKey(now),
      client: opts.client ?? "",
      proxy_mode: opts.proxyMode ?? "",
      status: "active",
      record_count: 0,
      summary: null
    });
    return id;
  }
  getOrCreateSession(id, opts = {}) {
    const existing = this.loadSessionRow(id);
    if (existing)
      return { sessionId: id, recordCount: existing.record_count };
    const now = /* @__PURE__ */ new Date();
    const iso = now.toISOString();
    this.writeSession({
      id,
      started_at: iso,
      updated_at: iso,
      date_key: localDateKey(now),
      client: opts.client ?? "",
      proxy_mode: opts.proxyMode ?? "",
      status: "active",
      record_count: 0,
      summary: null
    });
    return { sessionId: id, recordCount: 0 };
  }
  appendRecord(id, record) {
    let row = this.loadSessionRow(id);
    if (!row) {
      this.getOrCreateSession(id);
      row = this.loadSessionRow(id);
    }
    appendFileSync2(this.recordsFile(id), JSON.stringify(record) + "\n", "utf8");
    row.record_count += 1;
    row.updated_at = typeof record.timestamp === "string" ? record.timestamp : (/* @__PURE__ */ new Date()).toISOString();
    row.status = "active";
    this.writeSession(row);
  }
  finalizeSession(id, summary) {
    const row = this.loadSessionRow(id);
    if (!row)
      return;
    let status = "complete";
    if (summary) {
      const apiCalls = Number(summary.api_calls ?? 0);
      if (apiCalls === 0)
        status = "empty";
      else if (summary.has_error)
        status = "error";
    }
    const merged = { ...row.summary ?? {}, ...summary ?? {} };
    merged.status = status;
    merged.id = id;
    merged.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    row.status = status;
    row.summary = merged;
    row.updated_at = merged.updated_at;
    this.writeSession(row);
  }
  readRecords(id) {
    const f = this.recordsFile(id);
    if (!existsSync6(f))
      return [];
    return readFileSync12(f, "utf8").split("\n").filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
  }
  listSessions() {
    if (!existsSync6(this.sessionsDir))
      return [];
    const out = [];
    for (const name2 of readdirSync3(this.sessionsDir)) {
      if (!name2.endsWith(".json"))
        continue;
      try {
        out.push(JSON.parse(readFileSync12(join22(this.sessionsDir, name2), "utf8")));
      } catch {
      }
    }
    return out;
  }
};
function createTraceStore(opts = {}) {
  return new FileTraceStore(resolveTraceDir(opts));
}
var store = null;
function getTraceStore() {
  if (store === null)
    store = createTraceStore();
  return store;
}

// packages/tap/dist/security.js
import { existsSync as existsSync7, mkdirSync as mkdirSync4, readFileSync as readFileSync13, renameSync as renameSync3, writeFileSync as writeFileSync3 } from "node:fs";
import { join as join23 } from "node:path";
var FLAG_NAME = "capture.enabled";
var TTL_MS = 1e3;
var cache = /* @__PURE__ */ new Map();
function flagPath(opts = {}) {
  return join23(resolveStateDir(opts), FLAG_NAME);
}
function isCaptureEnabled(opts = {}) {
  const p = flagPath(opts);
  const now = Date.now();
  const hit = cache.get(p);
  if (hit && now - hit.ts < TTL_MS)
    return hit.val;
  let val = false;
  try {
    if (existsSync7(p)) {
      const raw = readFileSync13(p, "utf8").trim().toLowerCase();
      val = raw === "1" || raw === "true" || raw === "on" || raw === "yes";
    }
  } catch {
    val = false;
  }
  cache.set(p, { val, ts: now });
  return val;
}
var intercepts = [];
function registerIntercept(entry) {
  intercepts.push(entry);
  return () => {
    const i = intercepts.indexOf(entry);
    if (i >= 0)
      intercepts.splice(i, 1);
  };
}
function activeIntercepts() {
  return intercepts.slice();
}
function tapStatus(opts = {}) {
  const active = activeIntercepts();
  const captureEnabled = isCaptureEnabled(opts);
  const intercepting = active.length > 0;
  const ports = active.map((e) => e.port).join(", ");
  const tlsCount = active.filter((e) => e.tls).length;
  const tlsNote = tlsCount > 0 ? `\uFF1B${tlsCount} \u4E2A\u7ED1\u5B9A\u88C5\u4E86\u672C\u5730 CA\uFF0Ccapture=ON \u65F6\u4F1A\u5BF9 CONNECT \u6D41\u91CF\u505A TLS MITM \u89E3\u5BC6` : "";
  const message = intercepting ? `tap \u6B63\u5728\u62E6\u622A\u6D41\u91CF\uFF1A${active.length} \u4E2A\u7AEF\u53E3 [${ports}]\uFF08capture=${captureEnabled ? "ON" : "OFF"}\uFF0C\u6570\u636E\u4EC5\u843D\u672C\u5730\uFF09${tlsNote}` : `tap \u672A\u62E6\u622A\uFF08\u9ED8\u8BA4 OFF\uFF1Bcapture=${captureEnabled ? "ON" : "OFF"}\uFF09`;
  return {
    captureEnabled,
    intercepting,
    interceptCount: active.length,
    intercepts: active,
    storeDir: resolveTapDir(opts),
    outbound: "local-only",
    message
  };
}

// packages/tap/dist/capture-proxy.js
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
var RECORDED_PATH = "/v1/messages";
function relayHeaders(upstream, includeLength, bodyLen) {
  const out = {};
  for (const [k, v] of Object.entries(upstream.headers)) {
    if (HOP_BY_HOP.has(k.toLowerCase()))
      continue;
    if (v !== void 0)
      out[k] = v;
  }
  if (includeLength)
    out["Content-Length"] = String(bodyLen);
  return out;
}
function serve(opts) {
  const store2 = opts.store ?? getTraceStore();
  const client = opts.client ?? "claude";
  const targetUrl = new URL(opts.target);
  const upstreamBaseUrl = `${targetUrl.protocol}//${targetUrl.host}`;
  const recordedSet = new Set(opts.recordedPaths ?? [RECORDED_PATH]);
  const stripPrefix = opts.stripPrefix ?? "";
  const host = opts.host ?? "127.0.0.1";
  const sessionId = store2.createSession({ client, proxyMode: "reverse" });
  const counter = new TurnCounter();
  const sessionTurns = /* @__PURE__ */ new Map();
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      void handle(Buffer.concat(chunks));
    });
    req.on("error", () => {
      try {
        res.destroy();
      } catch {
      }
    });
    res.on("error", () => {
    });
    async function handle(body) {
      const path6 = req.url ?? "/";
      const cleanPath = path6.split("?", 1)[0];
      const method = (req.method ?? "GET").toUpperCase();
      const recorded = method === "POST" && recordedSet.has(cleanPath) && isCaptureEnabled({ dir: store2.dir });
      let realSid = sessionId;
      let turn = 0;
      if (recorded) {
        try {
          realSid = extractRealSessionId(req.headers, body, sessionId);
          const { recordCount } = store2.getOrCreateSession(realSid, { client, proxyMode: "reverse" });
          const base = sessionTurns.get(realSid) ?? recordCount;
          turn = base + 1;
          sessionTurns.set(realSid, turn);
        } catch {
          realSid = sessionId;
          turn = counter.next();
        }
      }
      let upstreamPath = path6;
      if (stripPrefix && (cleanPath === stripPrefix || cleanPath.startsWith(stripPrefix + "/"))) {
        upstreamPath = path6.slice(stripPrefix.length) || "/";
      }
      const fwdHeaders = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (HOP_BY_HOP.has(k.toLowerCase()))
          continue;
        if (v !== void 0)
          fwdHeaders[k] = v;
      }
      fwdHeaders.Host = targetUrl.host;
      const t0 = Date.now();
      const reqBody = recorded ? safeJson(body) : null;
      const isHttps = targetUrl.protocol === "https:";
      const reqFn = isHttps ? httpsRequest : httpRequest;
      const reqOpts = {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || (isHttps ? 443 : 80),
        method,
        path: upstreamPath,
        headers: fwdHeaders
      };
      const upReq = reqFn(reqOpts, (upstream) => {
        const status = upstream.statusCode ?? 502;
        const ctype = String(upstream.headers["content-type"] ?? "").toLowerCase();
        const isStream = ctype.includes("text/event-stream");
        const captureBuf = [];
        if (isStream) {
          try {
            res.writeHead(status, relayHeaders(upstream, false, 0));
          } catch {
          }
          upstream.on("data", (c) => {
            try {
              res.write(c);
            } catch {
            }
            if (recorded)
              captureBuf.push(c);
          });
          upstream.on("end", () => {
            try {
              res.end();
            } catch {
            }
            if (recorded) {
              const rawText = Buffer.concat(captureBuf).toString("utf8");
              appendCapture(status, upstream, rawText, rawText);
            }
          });
        } else {
          upstream.on("data", (c) => captureBuf.push(c));
          upstream.on("end", () => {
            const raw = Buffer.concat(captureBuf);
            try {
              res.writeHead(status, relayHeaders(upstream, true, raw.length));
              res.end(raw);
            } catch {
            }
            if (recorded)
              appendCapture(status, upstream, safeJson(raw), void 0);
          });
        }
      });
      upReq.on("error", (err) => {
        const msg = Buffer.from(JSON.stringify({ error: `upstream unavailable: ${err.message}` }), "utf8");
        try {
          res.writeHead(502, { "Content-Type": "application/json", "Content-Length": msg.length });
          res.end(msg);
        } catch {
        }
        if (recorded) {
          try {
            store2.appendRecord(realSid, buildRecord({
              reqId: reqId(),
              turn,
              durationMs: Date.now() - t0,
              method,
              path: path6,
              reqHeaders: req.headers,
              reqBody,
              status: 502,
              respHeaders: {},
              respBody: { error: err.message },
              upstreamBaseUrl
            }));
          } catch {
          }
        }
      });
      if (body.length)
        upReq.write(body);
      upReq.end();
      function appendCapture(status, upstream, respBody, _raw) {
        try {
          store2.appendRecord(realSid, buildRecord({
            reqId: reqId(),
            turn,
            durationMs: Date.now() - t0,
            method,
            path: path6,
            reqHeaders: req.headers,
            reqBody,
            status,
            respHeaders: upstream.headers,
            respBody,
            upstreamBaseUrl
          }));
        } catch {
        }
      }
    }
  });
  return new Promise((resolve10, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, host, () => {
      server.removeAllListeners("error");
      const boundPort = server.address().port;
      const unregister = registerIntercept({ kind: "reverse", port: boundPort, client, target: opts.target });
      resolve10({
        port: boundPort,
        host,
        target: opts.target,
        client,
        sessionId,
        store: store2,
        close() {
          return new Promise((res) => {
            unregister();
            try {
              const row = store2.loadSessionRow(sessionId);
              store2.finalizeSession(sessionId, { api_calls: row?.record_count ?? 0, has_error: false });
            } catch {
            }
            server.close(() => res());
            server.closeAllConnections?.();
          });
        }
      });
    });
  });
}
function reqId() {
  return Math.random().toString(16).slice(2, 14);
}

// packages/tap/dist/forward-proxy.js
import { createServer as createServer3, request as httpRequest2 } from "node:http";
import { connect as netConnect2 } from "node:net";

// packages/tap/dist/bedrock.js
var CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++)
      c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(buf) {
  let crc = 4294967295;
  for (let i = 0; i < buf.length; i++)
    crc = CRC_TABLE[(crc ^ buf[i]) & 255] ^ crc >>> 8;
  return (crc ^ 4294967295) >>> 0;
}
var BEDROCK_STREAM_SUFFIXES = ["/invoke-with-response-stream", "/converse-stream"];
var BEDROCK_ERROR_EVENT_KEYS = /* @__PURE__ */ new Set([
  "internalServerException",
  "modelStreamErrorException",
  "modelTimeoutException",
  "serviceUnavailableException",
  "throttlingException",
  "validationException"
]);
function isBedrockEventstreamPath(path6) {
  const cleanPath = path6.split("?", 1)[0].replace(/\/+$/, "");
  return BEDROCK_STREAM_SUFFIXES.some((s) => cleanPath.endsWith(s));
}
var HEADER_TYPE_FIXED_SIZES = {
  0: 0,
  1: 0,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  8: 8,
  9: 16
};
var HEADER_TYPE_VAR_LEN = /* @__PURE__ */ new Set([6, 7]);
function decodeHeaders(data) {
  const headers = {};
  let pos = 0;
  while (pos < data.length) {
    if (pos + 1 > data.length)
      break;
    const nameLen = data[pos];
    pos += 1;
    if (pos + nameLen > data.length)
      break;
    const name2 = data.subarray(pos, pos + nameLen).toString("utf8");
    pos += nameLen;
    if (pos + 1 > data.length)
      break;
    const hdrType = data[pos];
    pos += 1;
    if (hdrType === 7) {
      if (pos + 2 > data.length)
        break;
      const valLen = data.readUInt16BE(pos);
      pos += 2;
      if (pos + valLen > data.length)
        break;
      headers[name2] = data.subarray(pos, pos + valLen).toString("utf8");
      pos += valLen;
    } else if (HEADER_TYPE_VAR_LEN.has(hdrType)) {
      if (pos + 2 > data.length)
        break;
      const valLen = data.readUInt16BE(pos);
      pos += 2 + valLen;
    } else {
      const fixed = HEADER_TYPE_FIXED_SIZES[hdrType];
      if (fixed === void 0)
        break;
      pos += fixed;
    }
  }
  return headers;
}
function decodeBedrockEventstreamEvents(body) {
  if (!Buffer.isBuffer(body) || body.length < 16)
    return [];
  const events = [];
  let pos = 0;
  while (pos < body.length) {
    if (pos + 12 > body.length)
      break;
    const totalLen = body.readUInt32BE(pos);
    const headersLen = body.readUInt32BE(pos + 4);
    if (totalLen < 16)
      break;
    if (pos + totalLen > body.length)
      break;
    const preludeCrc = body.readUInt32BE(pos + 8);
    if (preludeCrc !== crc32(body.subarray(pos, pos + 8)))
      break;
    const msgCrc = body.readUInt32BE(pos + totalLen - 4);
    if (msgCrc !== crc32(body.subarray(pos, pos + totalLen - 4))) {
      pos += totalLen;
      continue;
    }
    const headersStart = pos + 12;
    const headersEnd = headersStart + headersLen;
    const headers = decodeHeaders(body.subarray(headersStart, headersEnd));
    const payloadBytes = body.subarray(headersEnd, pos + totalLen - 4);
    let data = {};
    if (payloadBytes.length > 0) {
      try {
        data = JSON.parse(payloadBytes.toString("utf8"));
      } catch {
        data = {};
      }
    }
    if (typeof data !== "object" || data === null || Array.isArray(data))
      data = {};
    events.push({ headers, event: headers[":event-type"] ?? "", data });
    pos += totalLen;
  }
  return events;
}
function bedrockErrorEvents(events) {
  const errors = [];
  for (const event of events) {
    const eventType = event.event;
    if (typeof eventType !== "string" || !BEDROCK_ERROR_EVENT_KEYS.has(eventType))
      continue;
    const data = event.data;
    const error = { type: eventType };
    if (typeof data === "object" && data !== null && !Array.isArray(data))
      Object.assign(error, data);
    else if (data !== void 0 && data !== null)
      error.message = String(data);
    errors.push(error);
  }
  return errors;
}
function attachBedrockErrors(body, events) {
  const errors = bedrockErrorEvents(events);
  if (errors.length === 0)
    return body;
  const first = errors[0];
  const annotated = typeof body === "object" && body !== null && !Array.isArray(body) ? { ...body } : { raw_body: body };
  if (!("error" in annotated))
    annotated.error = first;
  annotated.bedrock_errors = errors;
  return annotated;
}
function assembleBedrockConverseBody(events) {
  let role = "assistant";
  const blockOrder = [];
  const blockKind = /* @__PURE__ */ new Map();
  const blockToolMeta = /* @__PURE__ */ new Map();
  const blockTextParts = /* @__PURE__ */ new Map();
  const blockToolInputParts = /* @__PURE__ */ new Map();
  const blockReasoningParts = /* @__PURE__ */ new Map();
  const blockReasoningSig = /* @__PURE__ */ new Map();
  let usage = {};
  const toIdx = (v) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  };
  for (const event of events) {
    const eventType = event.event || event.headers[":event-type"] || "";
    let data = event.data;
    if (typeof data !== "object" || data === null || Array.isArray(data))
      data = {};
    if (eventType === "messageStart") {
      role = data.role || "assistant";
    } else if (eventType === "contentBlockStart") {
      const idx = toIdx(data.contentBlockIndex);
      const start = typeof data.start === "object" && data.start !== null ? data.start : {};
      const toolUse = typeof start.toolUse === "object" && start.toolUse !== null ? start.toolUse : null;
      if (!blockKind.has(idx))
        blockOrder.push(idx);
      if (toolUse) {
        blockKind.set(idx, "tool_use");
        blockToolMeta.set(idx, { toolUseId: toolUse.toolUseId ?? "", name: toolUse.name ?? "" });
        blockToolInputParts.set(idx, []);
      } else if (!blockKind.has(idx)) {
        blockKind.set(idx, "text");
        blockTextParts.set(idx, []);
      }
    } else if (eventType === "contentBlockDelta") {
      const idx = toIdx(data.contentBlockIndex);
      const delta = typeof data.delta === "object" && data.delta !== null && !Array.isArray(data.delta) ? data.delta : {};
      if (!blockKind.has(idx))
        blockOrder.push(idx);
      const text = delta.text;
      const toolDelta = delta.toolUse;
      const reasoningDelta = delta.reasoningContent;
      if (typeof text === "string") {
        if (blockKind.get(idx) !== "tool_use") {
          if (!blockKind.has(idx))
            blockKind.set(idx, "text");
          if (!blockTextParts.has(idx))
            blockTextParts.set(idx, []);
          blockTextParts.get(idx).push(text);
        }
      } else if (typeof toolDelta === "object" && toolDelta !== null && !Array.isArray(toolDelta)) {
        if (!blockKind.has(idx)) {
          blockKind.set(idx, "tool_use");
          if (!blockToolMeta.has(idx))
            blockToolMeta.set(idx, { toolUseId: "", name: "" });
          blockToolInputParts.set(idx, []);
        }
        const partial = toolDelta.input;
        if (typeof partial === "string") {
          if (!blockToolInputParts.has(idx))
            blockToolInputParts.set(idx, []);
          blockToolInputParts.get(idx).push(partial);
        }
      } else if (typeof reasoningDelta === "object" && reasoningDelta !== null && !Array.isArray(reasoningDelta)) {
        if (!blockKind.has(idx))
          blockKind.set(idx, "reasoning");
        if (!blockReasoningParts.has(idx))
          blockReasoningParts.set(idx, []);
        const rtext = reasoningDelta.text;
        if (typeof rtext === "string")
          blockReasoningParts.get(idx).push(rtext);
        const sig = reasoningDelta.signature;
        if (typeof sig === "string" && sig)
          blockReasoningSig.set(idx, sig);
      }
    } else if (eventType === "metadata") {
      const u = data.usage;
      if (typeof u === "object" && u !== null && !Array.isArray(u))
        usage = u;
    }
  }
  const content = [];
  for (const idx of blockOrder) {
    const kind = blockKind.get(idx) ?? "text";
    if (kind === "tool_use") {
      const rawInput = (blockToolInputParts.get(idx) ?? []).join("");
      let parsedInput = {};
      if (rawInput) {
        try {
          parsedInput = JSON.parse(rawInput);
        } catch {
          parsedInput = {};
        }
      }
      const meta = blockToolMeta.get(idx) ?? { toolUseId: "", name: "" };
      content.push({ toolUse: { toolUseId: meta.toolUseId ?? "", name: meta.name ?? "", input: parsedInput } });
    } else if (kind === "reasoning") {
      const rtext = (blockReasoningParts.get(idx) ?? []).join("");
      const rc = { text: rtext };
      const sig = blockReasoningSig.get(idx);
      if (sig)
        rc.signature = sig;
      content.push({ reasoningContent: rc });
    } else {
      const textAcc = (blockTextParts.get(idx) ?? []).join("");
      if (textAcc)
        content.push({ text: textAcc });
    }
  }
  return { output: { message: { role, content } }, usage };
}

// packages/tap/dist/tls-mitm.js
import { createServer as createServer2 } from "node:http";
import { request as httpsRequest2 } from "node:https";
import { TLSSocket, createSecureContext } from "node:tls";

// packages/tap/dist/ws-proxy.js
import { connect as netConnect } from "node:net";
import { connect as tlsConnect } from "node:tls";

// packages/tap/dist/ws-reconstruct.js
var WS_OPCODES = {
  CONTINUATION: 0,
  TEXT: 1,
  BINARY: 2,
  CLOSE: 8,
  PING: 9,
  PONG: 10
};
function decodeFrame(buf, offset = 0) {
  if (buf.length - offset < 2)
    return null;
  const b0 = buf[offset];
  const b1 = buf[offset + 1];
  const fin = (b0 & 128) !== 0;
  const opcode = b0 & 15;
  const masked = (b1 & 128) !== 0;
  let len = b1 & 127;
  let pos = offset + 2;
  if (len === 126) {
    if (buf.length - pos < 2)
      return null;
    len = buf.readUInt16BE(pos);
    pos += 2;
  } else if (len === 127) {
    if (buf.length - pos < 8)
      return null;
    len = Number(buf.readBigUInt64BE(pos));
    pos += 8;
  }
  let maskKey = null;
  if (masked) {
    if (buf.length - pos < 4)
      return null;
    maskKey = buf.subarray(pos, pos + 4);
    pos += 4;
  }
  if (buf.length - pos < len)
    return null;
  let payload = buf.subarray(pos, pos + len);
  if (masked && maskKey && len > 0) {
    const unmasked = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i++)
      unmasked[i] = payload[i] ^ maskKey[i % 4];
    payload = unmasked;
  }
  return { opcode, payload, fin, masked, frameLength: pos + len - offset };
}
function isPlainObject2(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isEmptyValue(v) {
  if (v === null || v === void 0)
    return true;
  if (v === "")
    return true;
  if (Array.isArray(v))
    return v.length === 0;
  if (isPlainObject2(v))
    return Object.keys(v).length === 0;
  return false;
}
function stableKey(item) {
  try {
    return JSON.stringify(item, (_k, val) => {
      if (isPlainObject2(val)) {
        const sorted = {};
        for (const k of Object.keys(val).sort())
          sorted[k] = val[k];
        return sorted;
      }
      return val;
    });
  } catch {
    return String(item);
  }
}
function mergeJsonLists(existing, incoming) {
  const merged = [...existing];
  const seen = new Set(merged.map(stableKey));
  for (const item of incoming) {
    const key = stableKey(item);
    if (seen.has(key))
      continue;
    merged.push(item);
    seen.add(key);
  }
  return merged;
}
function parseMessage(msg) {
  const text = Buffer.isBuffer(msg) ? msg.toString("utf8") : String(msg);
  try {
    return JSON.parse(text);
  } catch {
    return void 0;
  }
}
function reconstructWsRequestBody(clientMessages) {
  let merged = null;
  for (const msg of clientMessages) {
    const parsed = parseMessage(msg);
    if (!isPlainObject2(parsed))
      continue;
    if (merged === null) {
      merged = { ...parsed };
      continue;
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (key === "input" || key === "tools") {
        if (Array.isArray(merged[key]) && Array.isArray(value)) {
          merged[key] = mergeJsonLists(merged[key], value);
        } else if (value) {
          merged[key] = value;
        } else if (!(key in merged)) {
          merged[key] = value;
        }
        continue;
      }
      if (!isEmptyValue(value))
        merged[key] = value;
      else if (!(key in merged))
        merged[key] = value;
    }
  }
  return merged;
}
var RESPONSE_MERGE_TYPES = /* @__PURE__ */ new Set(["response.created", "response.in_progress", "response.completed", "response.done"]);
function reconstructWsResponseBody(wsEvents) {
  let merged = null;
  const outputItems = /* @__PURE__ */ new Map();
  for (const event of wsEvents) {
    if (!isPlainObject2(event))
      continue;
    const eventType = event.type;
    const payload = "response" in event ? event.response : event;
    if (isPlainObject2(payload) && typeof eventType === "string" && RESPONSE_MERGE_TYPES.has(eventType)) {
      if (merged === null) {
        merged = { ...payload };
      } else {
        for (const [key, value] of Object.entries(payload)) {
          if (key === "output" || key === "usage") {
            if (value)
              merged[key] = value;
            else if (!(key in merged))
              merged[key] = value;
            continue;
          }
          if (!isEmptyValue(value))
            merged[key] = value;
          else if (!(key in merged))
            merged[key] = value;
        }
      }
    }
    if (eventType === "response.output_item.done") {
      const item = event.item;
      const outputIndex = event.output_index;
      if (isPlainObject2(item) && typeof outputIndex === "number" && Number.isInteger(outputIndex)) {
        outputItems.set(outputIndex, item);
      }
    }
  }
  if (outputItems.size > 0) {
    const ordered = [...outputItems.keys()].sort((a, b) => a - b).map((idx) => outputItems.get(idx));
    if (merged === null)
      merged = { output: ordered };
    else if (!merged.output)
      merged.output = ordered;
  }
  return merged;
}
var CAPTURE_ONLY_MODEL_PREFIXES = [
  "/v1/messages",
  "/v1/complete",
  "/model/",
  "/v1/responses",
  "/responses",
  "/v1/chat/completions",
  "/chat/completions",
  "/v1/completions",
  "/completions",
  "/v1/models",
  "/models",
  "/v1beta/models",
  "/v1alpha/models"
];
var CAPTURE_ONLY_BODY_KEYS = ["system", "messages", "instructions", "input", "contents", "system_instruction"];
function isCaptureOnlyRequest(path6, body) {
  const cleanPath = path6.split("?", 1)[0];
  if (cleanPath.startsWith("/v1/embeddings") || cleanPath.startsWith("/embeddings") || cleanPath.startsWith("/v1/files") || cleanPath.startsWith("/files")) {
    return false;
  }
  if (CAPTURE_ONLY_MODEL_PREFIXES.some((p) => cleanPath.startsWith(p)))
    return true;
  if (cleanPath.startsWith("/v1internal:") || cleanPath.startsWith("/v1internal/")) {
    return cleanPath.toLowerCase().includes("generatecontent");
  }
  if (isPlainObject2(body) && isPlainObject2(body.request))
    return isCaptureOnlyRequest(path6, body.request);
  return isPlainObject2(body) && CAPTURE_ONLY_BODY_KEYS.some((k) => k in body);
}
function wsInputItemIsPrompt(item) {
  if (typeof item === "string")
    return item.trim().length > 0;
  if (!isPlainObject2(item))
    return false;
  if (item.type === "function_call_output")
    return false;
  if (item.role === "user" || item.role === "developer" || item.role === "system")
    return true;
  return ["content", "text", "input_text"].some((k) => k in item);
}
var PROMPT_BEARING_KEYS = ["system", "instructions", "system_instruction", "systemInstruction", "messages", "contents", "prompt"];
function isPromptBearingWsRequestBody(body) {
  if (!isPlainObject2(body))
    return false;
  if (!isCaptureOnlyRequest("", body))
    return false;
  for (const key of PROMPT_BEARING_KEYS) {
    if (body[key])
      return true;
  }
  const input = body.input;
  if (typeof input === "string")
    return input.trim().length > 0;
  if (Array.isArray(input))
    return input.some((item) => wsInputItemIsPrompt(item));
  const nested = body.request;
  return isPlainObject2(nested) && isPromptBearingWsRequestBody(nested);
}

// packages/tap/dist/ws-proxy.js
var WsFrameAccumulator = class {
  buf = Buffer.alloc(0);
  pendingOpcode = null;
  pendingChunks = [];
  messages = [];
  push(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    for (; ; ) {
      const frame = decodeFrame(this.buf, 0);
      if (frame === null)
        break;
      this.buf = this.buf.subarray(frame.frameLength);
      this.consume(frame);
    }
  }
  consume(frame) {
    if (frame.opcode >= 8) {
      this.messages.push({ opcode: frame.opcode, payload: frame.payload });
      return;
    }
    if (frame.opcode === WS_OPCODES.CONTINUATION) {
      if (this.pendingOpcode !== null) {
        this.pendingChunks.push(frame.payload);
        if (frame.fin) {
          this.messages.push({ opcode: this.pendingOpcode, payload: Buffer.concat(this.pendingChunks) });
          this.pendingOpcode = null;
          this.pendingChunks = [];
        }
      }
      return;
    }
    if (frame.fin) {
      this.messages.push({ opcode: frame.opcode, payload: frame.payload });
    } else {
      this.pendingOpcode = frame.opcode;
      this.pendingChunks = [frame.payload];
    }
  }
};
var textOf = (m) => m.payload.toString("utf8");
function attachWsRelay(server, opts) {
  server.on("upgrade", (req, clientSocket, head) => {
    const resolved = opts.resolveTarget(req);
    if (!resolved) {
      try {
        clientSocket.destroy();
      } catch {
      }
      return;
    }
    const target = resolved;
    const connectTimeoutMs = opts.connectTimeoutMs ?? 3e4;
    const idleTimeoutMs = opts.idleTimeoutMs ?? 6e5;
    const t0 = Date.now();
    const upstreamSocket = target.useTls ? tlsConnect({ host: target.hostname, port: target.port, rejectUnauthorized: false }) : netConnect(target.port, target.hostname);
    let settled = false;
    const teardown = () => {
      if (settled)
        return;
      settled = true;
      try {
        clientSocket.setTimeout(0);
      } catch {
      }
      try {
        upstreamSocket.setTimeout(0);
      } catch {
      }
      try {
        clientSocket.destroy();
      } catch {
      }
      try {
        upstreamSocket.destroy();
      } catch {
      }
      finalize();
    };
    clientSocket.on("error", teardown);
    upstreamSocket.on("error", teardown);
    clientSocket.on("close", teardown);
    upstreamSocket.on("close", teardown);
    upstreamSocket.setTimeout(connectTimeoutMs);
    clientSocket.setTimeout(connectTimeoutMs);
    upstreamSocket.on("timeout", teardown);
    clientSocket.on("timeout", teardown);
    const clientAcc = new WsFrameAccumulator();
    const serverAcc = new WsFrameAccumulator();
    if (head && head.length)
      clientAcc.push(head);
    clientSocket.on("data", (chunk) => {
      clientAcc.push(chunk);
      if (!settled)
        upstreamSocket.write(chunk);
    });
    upstreamSocket.once("connect", () => {
      if (settled)
        return;
      const lines = [`${req.method ?? "GET"} ${req.url ?? "/"} HTTP/1.1`, `Host: ${target.hostname}`];
      for (const [k, v] of Object.entries(req.headers)) {
        if (k.toLowerCase() === "host")
          continue;
        const vals = Array.isArray(v) ? v : v !== void 0 ? [String(v)] : [];
        for (const val of vals)
          lines.push(`${k}: ${val}`);
      }
      upstreamSocket.write(Buffer.from(lines.join("\r\n") + "\r\n\r\n", "latin1"));
      if (head && head.length)
        upstreamSocket.write(head);
    });
    let handshakeBuf = Buffer.alloc(0);
    let inHandshake = true;
    upstreamSocket.on("data", (chunk) => {
      if (settled)
        return;
      if (inHandshake) {
        handshakeBuf = Buffer.concat([handshakeBuf, chunk]);
        const idx = handshakeBuf.indexOf("\r\n\r\n");
        if (idx === -1)
          return;
        inHandshake = false;
        upstreamSocket.setTimeout(idleTimeoutMs);
        clientSocket.setTimeout(idleTimeoutMs);
        const headerPart = handshakeBuf.subarray(0, idx + 4);
        const remainder = handshakeBuf.subarray(idx + 4);
        clientSocket.write(headerPart);
        if (remainder.length) {
          serverAcc.push(remainder);
          clientSocket.write(remainder);
        }
        return;
      }
      serverAcc.push(chunk);
      clientSocket.write(chunk);
    });
    let finalized = false;
    function finalize() {
      if (finalized)
        return;
      finalized = true;
      const clientTexts = clientAcc.messages.filter((m) => m.opcode === WS_OPCODES.TEXT).map(textOf);
      if (clientTexts.length === 0)
        return;
      const requestBody = reconstructWsRequestBody(clientTexts);
      if (!requestBody || !isPromptBearingWsRequestBody(requestBody))
        return;
      if (!isCaptureEnabled({ dir: opts.store.dir }))
        return;
      const serverEvents = serverAcc.messages.filter((m) => m.opcode === WS_OPCODES.TEXT).map((m) => {
        try {
          return JSON.parse(textOf(m));
        } catch {
          return void 0;
        }
      }).filter((v) => v !== void 0);
      const responseBody = reconstructWsResponseBody(serverEvents);
      try {
        opts.store.appendRecord(opts.sessionId, buildRecord({
          reqId: "ws_" + Math.random().toString(16).slice(2, 14),
          turn: opts.nextTurn(),
          durationMs: Date.now() - t0,
          method: "WS",
          path: req.url ?? "/",
          reqHeaders: req.headers,
          reqBody: requestBody,
          status: 101,
          respHeaders: {},
          respBody: responseBody,
          upstreamBaseUrl: `${target.useTls ? "wss" : "ws"}://${target.hostname}`,
          transport: "forward-ws"
        }));
      } catch {
      }
    }
  });
}

// packages/tap/dist/tls-mitm.js
function createTlsMitm(deps) {
  const { ca, store: store2, sessionId, counter, tunnels, connectTimeoutMs, forwardAndRecord: forwardAndRecord2 } = deps;
  let mitmServer = null;
  const resolveMitmTarget = (req) => req.socket.__mitmTarget ?? { hostname: String(req.headers.host ?? "").split(":")[0] || "", port: 443 };
  function getMitmServer() {
    if (mitmServer)
      return mitmServer;
    mitmServer = createServer2((req, res) => handleMitmRequest(req, res));
    mitmServer.on("clientError", () => {
    });
    attachWsRelay(mitmServer, {
      store: store2,
      sessionId,
      nextTurn: () => counter.next(),
      resolveTarget: (req) => {
        const t = resolveMitmTarget(req);
        return { hostname: t.hostname, port: t.port, useTls: true };
      },
      // B3：ws relay 复用 forward 的 connect(setup) 超时；idle 用 attachWsRelay 内部更保守的默认(见其定义)。
      connectTimeoutMs
    });
    return mitmServer;
  }
  function terminateTls(clientSocket, head, hostname, port) {
    try {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head && head.length)
        clientSocket.unshift(head);
      const { key, cert } = ca.secureContextOptions(hostname);
      const tlsSocket = new TLSSocket(clientSocket, { isServer: true, secureContext: createSecureContext({ key, cert }) });
      tlsSocket.__mitmTarget = { hostname, port };
      tunnels.add(clientSocket);
      tunnels.add(tlsSocket);
      const drop = () => {
        tunnels.delete(clientSocket);
        tunnels.delete(tlsSocket);
      };
      tlsSocket.on("error", () => {
        try {
          tlsSocket.destroy();
        } catch {
        }
        ;
        try {
          clientSocket.destroy();
        } catch {
        }
        ;
        drop();
      });
      tlsSocket.on("close", drop);
      clientSocket.on("error", () => {
        try {
          tlsSocket.destroy();
        } catch {
        }
        ;
        drop();
      });
      getMitmServer().emit("connection", tlsSocket);
    } catch {
      try {
        clientSocket.destroy();
      } catch {
      }
    }
  }
  function handleMitmRequest(req, res) {
    const target = resolveMitmTarget(req);
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => forwardMitm(Buffer.concat(chunks)));
    req.on("error", () => {
      try {
        res.destroy();
      } catch {
      }
    });
    res.on("error", () => {
    });
    function forwardMitm(body) {
      forwardAndRecord2(req, res, body, {
        makeReq: (o, onResp) => httpsRequest2({
          hostname: target.hostname,
          port: target.port,
          method: o.method,
          path: o.path,
          headers: o.headers,
          rejectUnauthorized: false
          // MITM 代理不校验上游证书（对齐老仓 forward 语义）
        }, onResp),
        path: req.url ?? "/",
        upstreamBaseUrl: `https://${target.hostname}`,
        transport: "forward-tls",
        host: target.hostname
      });
    }
  }
  return {
    terminate: terminateTls,
    close() {
      if (mitmServer) {
        try {
          mitmServer.close();
        } catch {
        }
      }
    }
  };
}

// packages/tap/dist/forward-proxy.js
function buildRespBody(path6, raw) {
  if (isBedrockEventstreamPath(path6)) {
    const events = decodeBedrockEventstreamEvents(raw);
    if (events.length > 0) {
      const assembled = assembleBedrockConverseBody(events);
      return attachBedrockErrors({ ...assembled, bedrock_events: events }, events);
    }
  }
  return safeJson(raw);
}
function relayHeaders2(upstream, includeLength, bodyLen) {
  const out = {};
  for (const [k, v] of Object.entries(upstream.headers)) {
    if (HOP_BY_HOP.has(k.toLowerCase()))
      continue;
    if (v !== void 0)
      out[k] = v;
  }
  if (includeLength)
    out["Content-Length"] = String(bodyLen);
  return out;
}
function forwardAndRecord(ctx, req, res, body, plan) {
  const { store: store2, sessionId, counter, connectTimeoutMs } = ctx;
  const { path: path6, upstreamBaseUrl, transport } = plan;
  const method = (req.method ?? "GET").toUpperCase();
  const captureGate = method === "POST" && isCaptureEnabled({ dir: store2.dir });
  const turn = counter.next();
  const t0 = Date.now();
  const reqBody = captureGate ? safeJson(body) : null;
  const fwdHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (HOP_BY_HOP.has(k.toLowerCase()))
      continue;
    if (v !== void 0)
      fwdHeaders[k] = v;
  }
  fwdHeaders.Host = plan.host;
  const upReq = plan.makeReq({ method, path: path6, headers: fwdHeaders }, (upstream) => {
    const status = upstream.statusCode ?? 502;
    const buf = [];
    upstream.on("data", (c) => buf.push(c));
    upstream.on("end", () => {
      const raw = Buffer.concat(buf);
      try {
        res.writeHead(status, relayHeaders2(upstream, true, raw.length));
        res.end(raw);
      } catch {
      }
      if (captureGate) {
        const skip = shouldSkipTraceRecord({
          upstreamUrl: upstreamBaseUrl + path6,
          path: path6,
          responseHeaders: upstream.headers,
          requestHeaders: req.headers,
          method
        });
        if (!skip) {
          try {
            store2.appendRecord(sessionId, buildRecord({
              reqId: reqId2(),
              turn,
              durationMs: Date.now() - t0,
              method,
              path: path6,
              reqHeaders: req.headers,
              reqBody,
              status,
              respHeaders: upstream.headers,
              respBody: buildRespBody(path6, raw),
              upstreamBaseUrl,
              transport
            }));
          } catch {
          }
        }
      }
    });
  });
  upReq.on("error", (err) => {
    const msg = Buffer.from(JSON.stringify({ error: `upstream unavailable: ${err.message}` }), "utf8");
    try {
      res.writeHead(502, { "Content-Type": "application/json", "Content-Length": msg.length });
      res.end(msg);
    } catch {
      try {
        res.destroy();
      } catch {
      }
    }
    if (captureGate) {
      try {
        store2.appendRecord(sessionId, buildRecord({
          reqId: reqId2(),
          turn,
          durationMs: Date.now() - t0,
          method,
          path: path6,
          reqHeaders: req.headers,
          reqBody,
          status: 502,
          respHeaders: {},
          respBody: { error: err.message },
          upstreamBaseUrl,
          transport
        }));
      } catch {
      }
    }
  });
  upReq.setTimeout(connectTimeoutMs, () => upReq.destroy(new Error("upstream timeout")));
  res.on("close", () => {
    if (!res.writableEnded)
      upReq.destroy();
  });
  if (body.length)
    upReq.write(body);
  upReq.end();
}
function serveForward(opts = {}) {
  const store2 = opts.store ?? getTraceStore();
  const client = opts.client ?? "forward";
  const host = opts.host ?? "127.0.0.1";
  const sessionId = store2.createSession({ client, proxyMode: "forward" });
  const counter = new TurnCounter();
  const tunnels = /* @__PURE__ */ new Set();
  const connectTimeoutMs = opts.connectTimeoutMs ?? 3e4;
  const tunnelIdleTimeoutMs = opts.tunnelIdleTimeoutMs ?? 3e5;
  const server = createServer3((req, res) => {
    let targetUrl;
    try {
      targetUrl = new URL(req.url ?? "");
      if (!/^https?:$/.test(targetUrl.protocol))
        throw new Error("non-http");
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "forward proxy \u9700\u7EDD\u5BF9 URI" }));
      return;
    }
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => forward(Buffer.concat(chunks)));
    req.on("error", () => {
      try {
        res.destroy();
      } catch {
      }
    });
    res.on("error", () => {
    });
    function forward(body) {
      forwardAndRecord({ store: store2, sessionId, counter, connectTimeoutMs }, req, res, body, {
        makeReq: (o, onResp) => httpRequest2({
          protocol: "http:",
          hostname: targetUrl.hostname,
          port: targetUrl.port || 80,
          method: o.method,
          path: o.path,
          headers: o.headers
        }, onResp),
        path: (targetUrl.pathname || "/") + (targetUrl.search || ""),
        upstreamBaseUrl: `${targetUrl.protocol}//${targetUrl.host}`,
        transport: "forward",
        host: targetUrl.host
      });
    }
  });
  const ca = opts.ca;
  const tlsMitm = ca ? createTlsMitm({
    ca,
    store: store2,
    sessionId,
    counter,
    tunnels,
    connectTimeoutMs,
    // T-a 共享管路以 DI 注入（预绑 ctx）——不从本文件 export（index.ts 对本文件是 export *，导出即漏公共 API）。
    forwardAndRecord: (req, res, body, plan) => forwardAndRecord({ store: store2, sessionId, counter, connectTimeoutMs }, req, res, body, plan)
  }) : null;
  server.on("connect", (req, clientSocket, head) => {
    const authority = req.url ?? "";
    const idx = authority.lastIndexOf(":");
    const hostname = idx > 0 ? authority.slice(0, idx) : authority;
    const port = idx > 0 ? Number(authority.slice(idx + 1)) || 443 : 443;
    if (tlsMitm && isCaptureEnabled({ dir: store2.dir })) {
      tlsMitm.terminate(clientSocket, head, hostname, port);
      return;
    }
    const upstream = netConnect2(port, hostname, () => {
      upstream.setTimeout(tunnelIdleTimeoutMs);
      clientSocket.setTimeout(tunnelIdleTimeoutMs);
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head && head.length)
        upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    tunnels.add(clientSocket);
    tunnels.add(upstream);
    const cleanup2 = () => {
      tunnels.delete(clientSocket);
      tunnels.delete(upstream);
      try {
        upstream.setTimeout(0);
      } catch {
      }
      try {
        clientSocket.setTimeout(0);
      } catch {
      }
      try {
        upstream.destroy();
      } catch {
      }
      try {
        clientSocket.destroy();
      } catch {
      }
    };
    upstream.setTimeout(connectTimeoutMs);
    upstream.on("timeout", cleanup2);
    clientSocket.on("timeout", cleanup2);
    upstream.on("error", () => {
      try {
        clientSocket.end();
      } catch {
      }
      ;
      cleanup2();
    });
    clientSocket.on("error", cleanup2);
    upstream.on("close", cleanup2);
    clientSocket.on("close", cleanup2);
  });
  return new Promise((resolve10, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, host, () => {
      server.removeAllListeners("error");
      const boundPort = server.address().port;
      const unregister = registerIntercept({ kind: "forward", port: boundPort, client, tls: !!ca });
      resolve10({
        port: boundPort,
        host,
        client,
        sessionId,
        store: store2,
        close() {
          return new Promise((res) => {
            unregister();
            for (const s of tunnels) {
              try {
                s.destroy();
              } catch {
              }
            }
            tunnels.clear();
            if (tlsMitm)
              tlsMitm.close();
            try {
              const row = store2.loadSessionRow(sessionId);
              store2.finalizeSession(sessionId, { api_calls: row?.record_count ?? 0, has_error: false });
            } catch {
            }
            server.close(() => res());
            server.closeAllConnections?.();
          });
        }
      });
    });
  });
}
function reqId2() {
  return "req_" + Math.random().toString(16).slice(2, 14);
}

// packages/tap/dist/daemon.js
var CLAUDE_LIFELINE_PORT = 8766;
async function startDaemon(opts) {
  const store2 = opts.store ?? getTraceStore();
  const host = opts.host ?? "127.0.0.1";
  const handles = {};
  try {
    for (const b of opts.bindings) {
      if (b.port === CLAUDE_LIFELINE_PORT) {
        throw new Error(`\u62D2\u7ED1 claude \u751F\u547D\u7EBF\u7AEF\u53E3 ${CLAUDE_LIFELINE_PORT}\uFF08lifeline isolation\uFF1A\u672C daemon \u4ECE 8767 \u8D77\uFF09`);
      }
      if (b.mode === "forward") {
        handles[b.name] = await serveForward({ port: b.port ?? 0, host, store: store2, client: b.name, ca: opts.ca });
      } else {
        if (!b.target)
          throw new Error(`reverse \u7ED1\u5B9A '${b.name}' \u7F3A target`);
        handles[b.name] = await serve({
          port: b.port ?? 0,
          host,
          store: store2,
          client: b.name,
          target: b.target,
          recordedPaths: b.recordedPaths,
          stripPrefix: b.stripPrefix
        });
      }
    }
  } catch (err) {
    await stopHandles(handles);
    throw err;
  }
  return {
    handles,
    stop: () => stopHandles(handles)
  };
}
async function stopHandles(handles) {
  for (const h of Object.values(handles)) {
    try {
      await h.close();
    } catch {
    }
  }
}

// packages/tap/dist/certs.js
import { X509Certificate, createPublicKey, createPrivateKey, createHash as createHash2, generateKeyPairSync, randomBytes as randomBytes2, sign as cryptoSign } from "node:crypto";
import { chmodSync, closeSync as closeSync3, existsSync as existsSync8, mkdirSync as mkdirSync5, openSync as openSync3, readFileSync as readFileSync14, renameSync as renameSync4, rmSync as rmSync2, statSync as statSync4, writeFileSync as writeFileSync4 } from "node:fs";
import { homedir as homedir4 } from "node:os";
import { join as join24 } from "node:path";
var CA_VALIDITY_DAYS = 5 * 365;
var HOST_VALIDITY_DAYS = 365;
var DAY_MS = 864e5;
function derLen(n) {
  if (n < 128)
    return Buffer.from([n]);
  const bytes = [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v & 255);
    v = Math.floor(v / 256);
  }
  return Buffer.from([128 | bytes.length, ...bytes]);
}
function tlv(tag2, content) {
  return Buffer.concat([Buffer.from([tag2]), derLen(content.length), content]);
}
var seq = (parts) => tlv(48, Buffer.concat(parts));
var set = (content) => tlv(49, content);
var nullDer = Buffer.from([5, 0]);
var utf8 = (s) => tlv(12, Buffer.from(s, "utf8"));
var boolDer = (b) => tlv(1, Buffer.from([b ? 255 : 0]));
var octet = (b) => tlv(4, b);
var bitString = (b) => tlv(3, Buffer.concat([Buffer.from([0]), b]));
var ctxExplicit = (n, content) => tlv(160 | n, content);
var ctxImplicit = (n, content) => tlv(128 | n, content);
function derInt(unsigned) {
  let b = Buffer.from(unsigned);
  let i = 0;
  while (i < b.length - 1 && b[i] === 0)
    i++;
  b = b.subarray(i);
  if (b.length === 0)
    b = Buffer.from([0]);
  if (b[0] & 128)
    b = Buffer.concat([Buffer.from([0]), b]);
  return tlv(2, b);
}
function derIntNum(n) {
  const bytes = [];
  let v = n;
  if (v === 0)
    bytes.push(0);
  while (v > 0) {
    bytes.unshift(v & 255);
    v = Math.floor(v / 256);
  }
  return derInt(Buffer.from(bytes));
}
function encodeOid(oid) {
  const parts = oid.split(".").map(Number);
  const bytes = [40 * parts[0] + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let v = parts[i];
    const stack = [v & 127];
    v = Math.floor(v / 128);
    while (v > 0) {
      stack.unshift(v & 127 | 128);
      v = Math.floor(v / 128);
    }
    bytes.push(...stack);
  }
  return tlv(6, Buffer.from(bytes));
}
function utcTime(d) {
  const p = (n) => String(n).padStart(2, "0");
  const s = `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  return tlv(23, Buffer.from(s, "ascii"));
}
var OID = {
  sha256Rsa: "1.2.840.113549.1.1.11",
  cn: "2.5.4.3",
  o: "2.5.4.10",
  basicConstraints: "2.5.29.19",
  keyUsage: "2.5.29.15",
  san: "2.5.29.17",
  extKeyUsage: "2.5.29.37",
  serverAuth: "1.3.6.1.5.5.7.3.1",
  subjectKeyId: "2.5.29.14",
  authorityKeyId: "2.5.29.35"
};
function name(attrs) {
  return seq(attrs.map(([oid, val]) => set(seq([encodeOid(oid), utf8(val)]))));
}
function algId(oid, params = nullDer) {
  return seq([encodeOid(oid), params]);
}
function extension(oid, critical, valueDer) {
  const parts = [encodeOid(oid)];
  if (critical)
    parts.push(boolDer(true));
  parts.push(octet(valueDer));
  return seq(parts);
}
function readTlv(buf, offset) {
  const tag2 = buf[offset];
  let p = offset + 1;
  let len = buf[p];
  p += 1;
  if (len & 128) {
    const n = len & 127;
    len = 0;
    for (let i = 0; i < n; i++)
      len = len * 256 + buf[p++];
  }
  return { tag: tag2, start: offset, contentStart: p, contentEnd: p + len, totalEnd: p + len };
}
function spkiPublicKeyBits(spkiDer) {
  const outer = readTlv(spkiDer, 0);
  const alg = readTlv(spkiDer, outer.contentStart);
  const bits = readTlv(spkiDer, alg.totalEnd);
  return spkiDer.subarray(bits.contentStart + 1, bits.contentEnd);
}
function subjectKeyIdentifier(spkiDer) {
  return createHash2("sha1").update(spkiPublicKeyBits(spkiDer)).digest();
}
function extractSubjectDn(certDer) {
  const cert = readTlv(certDer, 0);
  const tbs = readTlv(certDer, cert.contentStart);
  let p = tbs.contentStart;
  const first = readTlv(certDer, p);
  if (first.tag === 160)
    p = first.totalEnd;
  p = readTlv(certDer, p).totalEnd;
  p = readTlv(certDer, p).totalEnd;
  p = readTlv(certDer, p).totalEnd;
  p = readTlv(certDer, p).totalEnd;
  const subject = readTlv(certDer, p);
  return certDer.subarray(subject.start, subject.totalEnd);
}
function ipKind(host) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && host.split(".").every((n) => Number(n) <= 255))
    return 4;
  if (host.includes(":") && /^[0-9a-fA-F:]+$/.test(host))
    return 6;
  return 0;
}
function ipToBytes(host) {
  const kind = ipKind(host);
  if (kind === 4) {
    const parts = host.split(".").map(Number);
    if (parts.length === 4 && parts.every((n) => n >= 0 && n <= 255))
      return Buffer.from(parts);
  }
  if (kind === 6) {
    const [head, tail] = host.split("::");
    const h = head ? head.split(":") : [];
    const t = tail ? tail.split(":") : [];
    const missing = 8 - (h.length + t.length);
    const groups = missing >= 0 ? [...h, ...Array(missing).fill("0"), ...t] : host.split(":");
    if (groups.length === 8) {
      const bytes = Buffer.alloc(16);
      groups.forEach((g, i) => bytes.writeUInt16BE(parseInt(g || "0", 16) & 65535, i * 2));
      return bytes;
    }
  }
  return null;
}
function sanExtension(hostname) {
  const ip = ipToBytes(hostname);
  const generalName = ip ? tlv(135, ip) : tlv(130, Buffer.from(hostname, "ascii"));
  return extension(OID.san, false, seq([generalName]));
}
function buildCertificate(p) {
  const tbs = seq([
    ctxExplicit(0, derIntNum(2)),
    // version v3
    derInt(p.serial),
    algId(OID.sha256Rsa),
    p.issuer,
    seq([utcTime(p.notBefore), utcTime(p.notAfter)]),
    p.subject,
    p.subjectSpkiDer,
    // 直接嵌入 node 导出的 SPKI DER
    ctxExplicit(3, seq(p.extensions))
  ]);
  const signature = cryptoSign("sha256", tbs, p.signingKey);
  return seq([tbs, algId(OID.sha256Rsa), bitString(signature)]);
}
function toPem(der, label) {
  const b642 = der.toString("base64").replace(/(.{64})/g, "$1\n");
  return `-----BEGIN ${label}-----
${b642.endsWith("\n") ? b642 : b642 + "\n"}-----END ${label}-----
`;
}
function randomSerial() {
  const b = randomBytes2(16);
  b[0] = b[0] & 127;
  return b;
}
function createCa(opts = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const spki = publicKey.export({ type: "spki", format: "der" });
  const caName = name([
    [OID.cn, opts.commonName ?? "pipeline-tap CA"],
    [OID.o, opts.organization ?? "pipeline-tap"]
  ]);
  const now = /* @__PURE__ */ new Date();
  const der = buildCertificate({
    subject: caName,
    issuer: caName,
    subjectSpkiDer: spki,
    serial: randomSerial(),
    notBefore: new Date(now.getTime() - 6e4),
    notAfter: new Date(now.getTime() + (opts.validityDays ?? CA_VALIDITY_DAYS) * DAY_MS),
    extensions: [
      extension(OID.basicConstraints, true, seq([boolDer(true)])),
      // CA:TRUE
      extension(OID.keyUsage, true, bitString(Buffer.from([6]))),
      // keyCertSign + cRLSign
      extension(OID.subjectKeyId, false, octet(subjectKeyIdentifier(spki)))
    ],
    signingKey: privateKey
  });
  return {
    certPem: toPem(der, "CERTIFICATE"),
    keyPem: privateKey.export({ type: "pkcs8", format: "pem" })
  };
}
var sharedHostKey = null;
function getSharedHostKey() {
  if (sharedHostKey)
    return sharedHostKey;
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  sharedHostKey = {
    privateKey,
    spkiDer: publicKey.export({ type: "spki", format: "der" }),
    keyPem: privateKey.export({ type: "pkcs8", format: "pem" })
  };
  return sharedHostKey;
}
function issueHostCert(ca, hostname, opts = {}) {
  const caKey = createPublicKey(ca.certPem);
  const caSpki = caKey.export({ type: "spki", format: "der" });
  const caSigningKey = loadPrivateKey(ca.keyPem);
  const caCertDer = new X509Certificate(ca.certPem).raw;
  const issuer = extractSubjectDn(caCertDer);
  const hostKey = getSharedHostKey();
  const spki = hostKey.spkiDer;
  const now = /* @__PURE__ */ new Date();
  const der = buildCertificate({
    subject: name([[OID.cn, hostname]]),
    issuer,
    subjectSpkiDer: spki,
    serial: randomSerial(),
    notBefore: new Date(now.getTime() - 6e4),
    notAfter: new Date(now.getTime() + (opts.validityDays ?? HOST_VALIDITY_DAYS) * DAY_MS),
    extensions: [
      sanExtension(hostname),
      extension(OID.extKeyUsage, false, seq([encodeOid(OID.serverAuth)])),
      extension(OID.subjectKeyId, false, octet(subjectKeyIdentifier(spki))),
      extension(OID.authorityKeyId, false, seq([ctxImplicit(0, subjectKeyIdentifier(caSpki))]))
    ],
    signingKey: caSigningKey
  });
  return {
    certPem: toPem(der, "CERTIFICATE"),
    keyPem: hostKey.keyPem
  };
}
function loadPrivateKey(keyPem) {
  return createPrivateKey(keyPem);
}
function resolveCaDir(opts = {}) {
  if (opts.dir)
    return opts.dir;
  const env = opts.env ?? process.env;
  const override = (env.PIPELINE_TAP_CA_DIR ?? "").trim();
  if (override)
    return override;
  const home = opts.home ?? homedir4();
  return join24(home, ".pipeline-tap");
}
var LOCK_WAIT_MS = 1e4;
var STEAL_MAX_ATTEMPTS = 5;
function tryLoadPair(caCertPath, caKeyPath) {
  if (!existsSync8(caCertPath) || !existsSync8(caKeyPath))
    return null;
  try {
    const certPem = readFileSync14(caCertPath, "utf8");
    const keyPem = readFileSync14(caKeyPath, "utf8");
    const cert = new X509Certificate(certPem);
    const key = loadPrivateKey(keyPem);
    if (!cert.checkPrivateKey(key))
      return null;
    chmodSync(caKeyPath, 384);
    return { certPem, keyPem };
  } catch {
    return null;
  }
}
function waitForPair(caCertPath, caKeyPath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (; ; ) {
    const pair = tryLoadPair(caCertPath, caKeyPath);
    if (pair)
      return pair;
    if (Date.now() >= deadline)
      return null;
    napSync(50);
  }
}
function napSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
  }
}
function stealLock(lockPath2) {
  try {
    const st = statSync4(lockPath2);
    if (Date.now() - st.mtimeMs < LOCK_WAIT_MS)
      return null;
  } catch {
    return null;
  }
  const grave = `${lockPath2}.stale.${process.pid}.${randomBytes2(4).toString("hex")}`;
  try {
    renameSync4(lockPath2, grave);
  } catch {
    return null;
  }
  try {
    rmSync2(grave);
  } catch {
  }
  try {
    return openSync3(lockPath2, "wx");
  } catch (err) {
    if (err.code === "EEXIST")
      return null;
    throw err;
  }
}
function ensureCa(opts = {}) {
  const caDir = resolveCaDir(opts);
  mkdirSync5(caDir, { recursive: true });
  const caCertPath = join24(caDir, "ca.pem");
  const caKeyPath = join24(caDir, "ca-key.pem");
  const lockPath2 = join24(caDir, "ca.lock");
  const fast = tryLoadPair(caCertPath, caKeyPath);
  if (fast)
    return { caCertPath, caKeyPath, ...fast };
  let lockFd;
  for (let attempt = 0; attempt < STEAL_MAX_ATTEMPTS; attempt++) {
    try {
      lockFd = openSync3(lockPath2, "wx");
      break;
    } catch (err) {
      if (err.code !== "EEXIST")
        throw err;
    }
    const waited = waitForPair(caCertPath, caKeyPath, LOCK_WAIT_MS);
    if (waited)
      return { caCertPath, caKeyPath, ...waited };
    const stolen = stealLock(lockPath2);
    if (stolen !== null) {
      lockFd = stolen;
      break;
    }
  }
  if (lockFd === void 0) {
    throw new Error(`ensureCa: CA \u9501 ${lockPath2} \u7ECF ${STEAL_MAX_ATTEMPTS} \u8F6E\u593A\u53D6\u7ADE\u4E89\u4ECD\u672A\u53D6\u5F97\u4E14\u59CB\u7EC8\u65E0\u914D\u5BF9 CA \u843D\u76D8\u2014\u2014\u7591\u4F3C\u6301\u7EED\u4E89\u7528\u6216\u78C1\u76D8\u5F02\u5E38`);
  }
  try {
    const again = tryLoadPair(caCertPath, caKeyPath);
    if (again)
      return { caCertPath, caKeyPath, ...again };
    const ca = createCa();
    writeAtomic(caCertPath, ca.certPem, 420);
    writeAtomic(caKeyPath, ca.keyPem, 384);
    chmodSync(caKeyPath, 384);
    return { caCertPath, caKeyPath, certPem: ca.certPem, keyPem: ca.keyPem };
  } finally {
    try {
      closeSync3(lockFd);
    } catch {
    }
    try {
      rmSync2(lockPath2);
    } catch {
    }
  }
}
function writeAtomic(path6, data, mode) {
  const tmp = `${path6}.${process.pid}.${randomBytes2(4).toString("hex")}.tmp`;
  writeFileSync4(tmp, data, { mode });
  renameSync4(tmp, path6);
  chmodSync(path6, mode);
}
var CertificateAuthority = class _CertificateAuthority {
  ca;
  cache = /* @__PURE__ */ new Map();
  constructor(ca) {
    this.ca = ca;
  }
  /** 从内存中的 createCa() 结果构造。 */
  static fromCa(ca) {
    return new _CertificateAuthority(ca);
  }
  /** 从落盘目录装载（缺则 ensureCa 生成）。certs.py:197 CertificateAuthority.__init__。 */
  static fromDir(opts = {}) {
    const res = ensureCa(opts);
    return new _CertificateAuthority({ certPem: res.certPem, keyPem: res.keyPem });
  }
  /** 返回本地 CA 证书 PEM（可供上层写入信任链；不含私钥）。 */
  caCertPem() {
    return this.ca.certPem;
  }
  /** 逐 host 证书（进程内缓存）。certs.py:207 get_host_cert_pem。 */
  getHostCert(hostname) {
    const hit = this.cache.get(hostname);
    if (hit)
      return hit;
    const pair = issueHostCert(this.ca, hostname);
    this.cache.set(hostname, pair);
    return pair;
  }
  /** tls.createSecureContext 所需 { key, cert }。certs.py:270 make_ssl_context。 */
  secureContextOptions(hostname) {
    const pair = this.getHostCert(hostname);
    return { key: pair.keyPem, cert: pair.certPem };
  }
};

// packages/tap/dist/clients.js
import { readFileSync as readFileSync15 } from "node:fs";
import { homedir as homedir5 } from "node:os";
import { join as join25 } from "node:path";
function cfg(partial) {
  return {
    provider: "anthropic",
    baseUrlSuffix: "",
    extraBaseUrlEnvs: [],
    nestingEnvKeys: [],
    baseUrlConfigKey: null,
    stripPathPrefix: "",
    stripPathPrefixUnlessTargetContains: [],
    defaultProxyMode: "reverse",
    forwardBaseUrlEnvs: [],
    forwardAllowedPathPrefixes: [],
    ...partial
  };
}
function reverseBaseUrl(c, port) {
  return `http://127.0.0.1:${port}${c.baseUrlSuffix}`;
}
function reverseEnvMap(c, port) {
  const url = reverseBaseUrl(c, port);
  const map = { [c.baseUrlEnv]: url };
  for (const key of c.extraBaseUrlEnvs)
    map[key] = url;
  return map;
}
function reverseStripPathPrefix(c, target) {
  if (!c.stripPathPrefix)
    return "";
  if (c.stripPathPrefixUnlessTargetContains.some((marker) => target.includes(marker)))
    return "";
  return c.stripPathPrefix;
}
var PROVIDER_RECORDED_PATHS = {
  anthropic: ["/v1/messages"],
  openai: ["/v1/chat/completions", "/v1/responses", "/chat/completions", "/responses"],
  gemini: []
};
var FORWARD_PROXY_ENV_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "http_proxy",
  "https_proxy",
  "ALL_PROXY",
  "all_proxy"
];
var FORWARD_CA_ENV_KEYS = [
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "CODEX_CA_CERTIFICATE",
  "REQUESTS_CA_BUNDLE"
];
function forwardEnvMap(port, caCertPath) {
  const proxyUrl = `http://127.0.0.1:${port}`;
  const env = {};
  for (const key of FORWARD_PROXY_ENV_KEYS)
    env[key] = proxyUrl;
  env.NO_PROXY = "localhost,127.0.0.1";
  env.no_proxy = "localhost,127.0.0.1";
  const ca = String(caCertPath);
  for (const key of FORWARD_CA_ENV_KEYS)
    env[key] = ca;
  return env;
}
var CLIENT_CONFIGS = {
  claude: cfg({
    cmd: "claude",
    label: "Claude Code",
    baseUrlEnv: "ANTHROPIC_BASE_URL",
    defaultTarget: "https://api.anthropic.com",
    provider: "anthropic",
    extraBaseUrlEnvs: ["ANTHROPIC_BEDROCK_BASE_URL"],
    nestingEnvKeys: ["CLAUDECODE", "CLAUDE_CODE_SSE_PORT"]
  }),
  codex: cfg({
    cmd: "codex",
    label: "Codex CLI",
    baseUrlEnv: "OPENAI_BASE_URL",
    defaultTarget: "https://api.openai.com",
    provider: "openai",
    baseUrlSuffix: "/v1",
    baseUrlConfigKey: "openai_base_url",
    stripPathPrefix: "/v1",
    stripPathPrefixUnlessTargetContains: ["api.openai.com"]
  }),
  // ── forward / MITM 模式（不支持 base-url override）──
  gemini: cfg({
    cmd: "gemini",
    label: "Gemini CLI",
    baseUrlEnv: "GOOGLE_GEMINI_BASE_URL",
    defaultTarget: "https://generativelanguage.googleapis.com",
    provider: "gemini",
    extraBaseUrlEnvs: ["GOOGLE_VERTEX_BASE_URL"],
    defaultProxyMode: "forward"
  }),
  opencode: cfg({
    cmd: "opencode",
    label: "OpenCode",
    baseUrlEnv: "ANTHROPIC_BASE_URL",
    defaultTarget: "https://api.anthropic.com",
    provider: "anthropic",
    defaultProxyMode: "forward"
  }),
  mimo: cfg({
    cmd: "mimo",
    label: "MiMo Code",
    baseUrlEnv: "ANTHROPIC_BASE_URL",
    defaultTarget: "https://api.anthropic.com",
    provider: "anthropic",
    defaultProxyMode: "forward"
  }),
  pi: cfg({
    cmd: "pi",
    label: "Pi",
    baseUrlEnv: "OPENAI_BASE_URL",
    baseUrlSuffix: "/v1",
    defaultTarget: "https://api.openai.com",
    provider: "openai",
    defaultProxyMode: "forward"
  }),
  hermes: cfg({
    cmd: "hermes",
    label: "Hermes Agent",
    baseUrlEnv: "OPENAI_BASE_URL",
    baseUrlSuffix: "/v1",
    defaultTarget: "https://api.openai.com",
    provider: "openai",
    defaultProxyMode: "forward"
  }),
  qoder: cfg({
    cmd: "qodercli",
    label: "Qoder CLI",
    baseUrlEnv: "QODER_BASE_URL",
    defaultTarget: "https://api2.qoder.sh",
    provider: "openai",
    defaultProxyMode: "forward"
  }),
  agy: cfg({
    cmd: "agy",
    label: "Antigravity CLI",
    baseUrlEnv: "CLOUD_CODE_URL",
    defaultTarget: "https://daily-cloudcode-pa.googleapis.com",
    provider: "gemini",
    defaultProxyMode: "forward",
    forwardBaseUrlEnvs: ["CLOUD_CODE_URL"],
    forwardAllowedPathPrefixes: ["/v1internal"]
  }),
  // ── reverse 补充 ──
  kimi: cfg({
    cmd: "kimi",
    label: "Kimi Code CLI",
    baseUrlEnv: "KIMI_BASE_URL",
    defaultTarget: "https://api.kimi.com/coding/v1",
    provider: "openai"
  }),
  "kimi-code": cfg({
    cmd: "kimi",
    label: "Kimi Code CLI",
    baseUrlEnv: "KIMI_CODE_BASE_URL",
    defaultTarget: "https://api.kimi.com/coding/v1",
    provider: "openai"
  }),
  openclaw: cfg({
    cmd: "openclaw",
    label: "OpenClaw",
    baseUrlEnv: "OPENAI_BASE_URL",
    baseUrlSuffix: "/v1",
    defaultTarget: "https://api.openai.com",
    provider: "openai",
    extraBaseUrlEnvs: ["ANTHROPIC_BASE_URL", "GOOGLE_GEMINI_BASE_URL", "OPENROUTER_BASE_URL", "CUSTOM_BASE_URL"]
  }),
  codebuddy: cfg({
    cmd: "codebuddy",
    label: "CodeBuddy",
    baseUrlEnv: "CODEBUDDY_BASE_URL",
    defaultTarget: "https://copilot.tencent.com/v2",
    provider: "openai"
  })
};
function readJson(path6) {
  try {
    const data = JSON.parse(readFileSync15(path6, "utf8"));
    return typeof data === "object" && data !== null && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}
function detectAnthropicTarget(c, env, home) {
  const fromEnv = (env.ANTHROPIC_BASE_URL ?? "").trim();
  if (fromEnv)
    return fromEnv.replace(/\/+$/, "");
  for (const name2 of ["settings.json", "settings.local.json"]) {
    const data = readJson(join25(home, ".claude", name2));
    const envBlock = typeof data.env === "object" && data.env !== null ? data.env : {};
    const val = String(envBlock.ANTHROPIC_BASE_URL ?? "").trim();
    if (val)
      return val.replace(/\/+$/, "");
  }
  return c.defaultTarget;
}
function detectCodexTarget(c, env, home) {
  const fromEnv = (env.OPENAI_BASE_URL ?? "").trim();
  if (fromEnv)
    return fromEnv.replace(/\/+$/, "");
  const auth = readJson(join25(home, ".codex", "auth.json"));
  if (auth.tokens && !auth.OPENAI_API_KEY)
    return "https://chatgpt.com/backend-api/codex";
  return c.defaultTarget;
}
function detectTarget(client, opts = {}) {
  const c = CLIENT_CONFIGS[client];
  if (!c)
    throw new Error(`\u672A\u77E5 client: ${client}`);
  const env = opts.env ?? process.env;
  const home = opts.home ?? homedir5();
  if (client === "claude")
    return detectAnthropicTarget(c, env, home);
  if (client === "codex")
    return detectCodexTarget(c, env, home);
  if (c.baseUrlEnv) {
    const fromEnv = (env[c.baseUrlEnv] ?? "").trim();
    if (fromEnv)
      return fromEnv.replace(/\/+$/, "");
  }
  return c.defaultTarget;
}
function recordedPaths(client) {
  const c = CLIENT_CONFIGS[client];
  if (!c)
    return [];
  return PROVIDER_RECORDED_PATHS[c.provider] ?? [];
}
var BEDROCK_HOST_RE = /(^|\.)((bedrock-runtime|bedrock-runtime-fips)\.[a-z0-9-]+\.(amazonaws\.com|amazonaws\.com\.cn|vpce\.amazonaws\.com)|bedrock-mantle\.[a-z0-9-]+\.(api\.aws|amazonaws\.com|amazonaws\.com\.cn))$/;
function isAwsNativeBedrockUrl(url) {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return BEDROCK_HOST_RE.test(host);
}
function requiresForwardForUrl(url) {
  return isAwsNativeBedrockUrl(url);
}

// packages/tap/dist/launch.js
var FORWARD_BINDING_NAME = "__forward__";
var modeOf = (client, forceForward) => forceForward?.has(client) ? "forward" : CLIENT_CONFIGS[client].defaultProxyMode ?? "reverse";
var effectiveMode = (client, target, forceForward) => modeOf(client, forceForward) === "forward" || requiresForwardForUrl(target) ? "forward" : "reverse";
function planBindings(clients, detect, forceForward) {
  const unknown = clients.filter((c) => !CLIENT_CONFIGS[c]);
  if (unknown.length > 0)
    throw new Error(`\u672A\u77E5 client: ${unknown.join(", ")}`);
  const forced = new Set(forceForward ?? []);
  const targets2 = {};
  const bindings = [];
  let needForward = false;
  for (const client of clients) {
    const cfg2 = CLIENT_CONFIGS[client];
    const target = detectTarget(client, detect);
    targets2[client] = target;
    if (effectiveMode(client, target, forced) === "reverse") {
      bindings.push({
        name: client,
        mode: "reverse",
        port: 0,
        target,
        recordedPaths: [...recordedPaths(client)],
        stripPrefix: reverseStripPathPrefix(cfg2, target) || void 0
      });
    } else {
      needForward = true;
    }
  }
  if (needForward)
    bindings.push({ name: FORWARD_BINDING_NAME, mode: "forward", port: 0 });
  return { bindings, targets: targets2 };
}
async function launchTap(opts) {
  const forced = new Set(opts.forceForward ?? []);
  const { bindings, targets: targets2 } = planBindings(opts.clients, opts.detect, opts.forceForward);
  const forwardClients = opts.clients.filter((c) => effectiveMode(c, targets2[c], forced) === "forward");
  let authority;
  let caCertPath;
  if (opts.ca) {
    caCertPath = ensureCa(opts.ca).caCertPath;
    authority = CertificateAuthority.fromDir(opts.ca);
  }
  if (forwardClients.length > 0 && !caCertPath) {
    throw new Error(`forward client(s) ${forwardClients.join(", ")} \u9700\u8981 opts.ca\uFF08\u672C\u5730 CA \u76EE\u5F55\uFF09\uFF1A\u7F3A ca \u65F6\u4EE3\u7406\u53EA\u80FD\u76F2\u96A7\u9053\uFF0CNODE_EXTRA_CA_CERTS \u7B49\u4FE1\u4EFB env \u65E0\u610F\u4E49\u751A\u81F3\u8BEF\u5BFC\u2014\u2014\u62D2\u7EDD\u800C\u975E\u9759\u9ED8\u964D\u7EA7\u3002`);
  }
  const daemon = await startDaemon({ bindings, store: opts.store, host: opts.host, ca: authority });
  const clients = opts.clients.map((client) => {
    const cfg2 = CLIENT_CONFIGS[client];
    const mode = effectiveMode(client, targets2[client], forced);
    const handle = mode === "reverse" ? daemon.handles[client] : daemon.handles[FORWARD_BINDING_NAME];
    const env = mode === "reverse" ? reverseEnvMap(cfg2, handle.port) : forwardEnvMap(handle.port, caCertPath);
    return { client, mode, port: handle.port, target: targets2[client], env };
  });
  return { daemon, clients, caCertPath };
}

// packages/cli/src/afkReadiness.ts
import { execFile as execFile2 } from "node:child_process";
var nodeExecDocker = (args) => new Promise((resolve10) => {
  execFile2("docker", [...args], (err, stdout, stderr) => {
    const code = err?.code;
    const exitCode = err === null ? 0 : typeof code === "number" ? code : 1;
    resolve10({ stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), exitCode });
  });
});
async function execDocker(args, opts) {
  const exec = opts?.exec ?? nodeExecDocker;
  const timeoutMs = opts?.timeoutMs ?? 5e3;
  let timer;
  try {
    const timeout = new Promise((resolve10) => {
      timer = setTimeout(() => resolve10(null), timeoutMs);
    });
    return await Promise.race([exec(args).catch(() => null), timeout]);
  } finally {
    if (timer !== void 0) clearTimeout(timer);
  }
}
function credLight(key, hostEnv, secretsEnv) {
  const envVal = hostEnv[key];
  if (envVal !== void 0 && envVal !== "") return { set: true, source: "host-env" };
  const fileVal = secretsEnv[key];
  if (fileVal !== void 0 && fileVal !== "") return { set: true, source: "secrets-file" };
  return { set: false };
}
function codexHomeLight(hostEnv) {
  const v = hostEnv.CODEX_HOME;
  return v !== void 0 && v !== "" ? { set: true, source: "host-env" } : { set: false };
}
async function probeAfkReadiness(opts) {
  const hostEnv = opts.hostEnv ?? process.env;
  const secretsEnv = opts.secretsEnv ?? {};
  const info = await execDocker(["info"], { exec: opts.exec, timeoutMs: opts.timeoutMs });
  const available = info !== null && info.exitCode === 0;
  let present = false;
  if (available) {
    const inspect = await execDocker(["image", "inspect", opts.image], { exec: opts.exec, timeoutMs: opts.timeoutMs });
    present = inspect !== null && inspect.exitCode === 0;
  }
  return {
    ok: true,
    docker: { available },
    image: { configured: opts.image, present, build_hint: SANDCASTLE_BUILD_HINT },
    credentials: {
      "claude-code": { CLAUDE_CODE_OAUTH_TOKEN: credLight("CLAUDE_CODE_OAUTH_TOKEN", hostEnv, secretsEnv) },
      codex: {
        OPENAI_API_KEY: credLight("OPENAI_API_KEY", hostEnv, secretsEnv),
        CODEX_HOME: codexHomeLight(hostEnv)
      }
    }
  };
}

// packages/cli/src/argv.ts
function splitPassthroughArgv(argv) {
  const idx = argv.indexOf("--", 2);
  if (idx === -1) return { toParse: [...argv] };
  if (argv[2] !== "tap") return { toParse: [...argv] };
  return { toParse: argv.slice(0, idx), passthrough: argv.slice(idx + 1) };
}
function splitFlags(args) {
  const positional = [];
  const flags = {};
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const nxt = args[i + 1];
      if (nxt !== void 0 && !nxt.startsWith("--")) {
        flags[key] = nxt;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
    i += 1;
  }
  return { positional, flags };
}

// packages/cli/src/deps.ts
function errMsg(e) {
  return e instanceof Error ? e.message : String(e);
}

// packages/cli/src/paths.ts
import { join as join26 } from "node:path";
function changesRoot(cwd) {
  return join26(cwd, "openspec", "changes");
}
function changeDir(cwd, name2) {
  return join26(changesRoot(cwd), name2);
}
function isValidChangeName(name2) {
  return /^[A-Za-z0-9_-]+$/.test(name2);
}

// packages/cli/src/render.ts
function str(v) {
  if (v === void 0) return "";
  return Array.isArray(v) ? v.join(",") : v;
}
function display(v) {
  const s = str(v);
  return s === "" ? "-" : s;
}
function renderTable(headers, rows) {
  const all = [headers, ...rows];
  const widths = headers.map((_, i) => Math.max(...all.map((r) => (r[i] ?? "").length)));
  return all.map(
    (r) => r.map((cell, i) => i === r.length - 1 ? cell : cell.padEnd(widths[i] ?? 0)).join("  ").trimEnd()
  );
}
function renderKV(pairs) {
  const width = Math.max(...pairs.map(([k]) => k.length)) + 2;
  return pairs.map(([k, v]) => `${k.padEnd(width)}${v}`.trimEnd());
}

// packages/cli/src/commands/check.ts
async function cmdCheck(deps, name2) {
  if (!isValidChangeName(name2)) {
    deps.io.err(`ERROR: change-name \u975E\u6CD5: '${name2}' (\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _)`);
    return 1;
  }
  const dir = changeDir(deps.cwd, name2);
  let state;
  try {
    state = await deps.store.read(dir);
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`);
    return 1;
  }
  const workflowName = resolveWorkflowName(state);
  if (workflowName !== "default") {
    return checkCustomWorkflow(deps, name2, dir, state, workflowName);
  }
  const result = deps.flow.guardCheck(state, deps.guardCtx?.(name2));
  deps.io.out(`[CHECK] ${name2} (phase=${display(state.fields.phase)})`);
  for (const warning of result.warnings ?? []) {
    deps.io.out(`  [WARN] ${warning}`);
  }
  if (result.pass) {
    deps.io.out("  [PASS] \u6240\u6709\u68C0\u67E5\u901A\u8FC7");
    return 0;
  }
  for (const failure of result.failures) {
    deps.io.out(`  [FAIL] ${failure}`);
  }
  deps.io.out(`  [FAIL] \u5171 ${result.failures.length} \u9879\u672A\u901A\u8FC7`);
  return 2;
}
function checkCustomWorkflow(deps, name2, dir, state, workflowName) {
  let wf;
  try {
    wf = loadWorkflow(deps.cwd, workflowName);
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`);
    return 1;
  }
  if (!wf) {
    deps.io.err(`ERROR: workflow '${workflowName}' \u672A\u627E\u5230\uFF08\u671F\u671B .pipeline/workflows/${workflowName}.yaml\uFF09`);
    return 1;
  }
  const currentStepId = str(state.fields.phase);
  const step = resolveStep(wf, currentStepId);
  if (!step) {
    deps.io.err(`ERROR: step '${currentStepId}' \u4E0D\u5728 workflow '${workflowName}' \u91CC`);
    return 1;
  }
  const result = evaluateStepGuards(state, step, { changeDirAbs: dir });
  deps.io.out(`[CHECK] ${name2} (phase=${display(state.fields.phase)})`);
  if (result.pass) {
    deps.io.out("  [PASS] \u6240\u6709\u68C0\u67E5\u901A\u8FC7");
    return 0;
  }
  for (const failure of result.failures) {
    deps.io.out(`  [FAIL] ${failure}`);
  }
  deps.io.out(`  [FAIL] \u5171 ${result.failures.length} \u9879\u672A\u901A\u8FC7`);
  return 2;
}

// packages/cli/src/commands/doctor.ts
import { join as join28 } from "node:path";

// packages/cli/src/skillSources.ts
import { readFileSync as readFileSync16 } from "node:fs";
import { dirname as dirname6, join as join27 } from "node:path";
import { fileURLToPath } from "node:url";
var TOOL_SET = /* @__PURE__ */ new Set([
  "claude-plugin",
  "skills-cli",
  "npm",
  "builtin",
  "bundled"
]);
var TIER_SET = /* @__PURE__ */ new Set([
  "mandatory",
  "recommended",
  "conditional",
  "optional"
]);
var SkillSourcesError = class extends Error {
  constructor(message) {
    super(`skill-sources: ${message}`);
    this.name = "SkillSourcesError";
  }
};
function defaultRegistryPath() {
  return join27(dirname6(fileURLToPath(import.meta.url)), "..", "..", "..", "templates", "skill-sources.yaml");
}
function stripComment2(line) {
  const t = line.trimStart();
  if (t.startsWith("#")) return "";
  const m = line.match(/^(.*?)\s#/);
  return (m ? m[1] : line).trimEnd();
}
function splitTopLevel(s, sep2) {
  const out = [];
  let cur = "";
  let quote = "";
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === sep2) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
function unquote(v) {
  const s = v.trim();
  if (s.length >= 2 && (s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) {
    return s.slice(1, -1);
  }
  return s;
}
function parseFlowBody(body, token) {
  const fields = /* @__PURE__ */ new Map();
  for (const rawPair of splitTopLevel(body, ",")) {
    const pair = rawPair.trim();
    if (pair === "") continue;
    const colon = pair.indexOf(":");
    if (colon <= 0) {
      throw new SkillSourcesError(`token '${token}' \u5B57\u6BB5 '${pair}' \u7F3A 'key: value' \u5192\u53F7`);
    }
    const key = pair.slice(0, colon).trim();
    const value = unquote(pair.slice(colon + 1));
    if (fields.has(key)) {
      throw new SkillSourcesError(`token '${token}' \u5B57\u6BB5 '${key}' \u91CD\u590D`);
    }
    fields.set(key, value);
  }
  return fields;
}
function parseEntry(line, lineNo) {
  const brace = line.indexOf("{");
  const close = line.lastIndexOf("}");
  if (brace < 0 || close < brace) {
    throw new SkillSourcesError(`\u7B2C ${lineNo} \u884C\u4E0D\u662F 'token: { ... }' \u5F62\u6001: '${line.trim()}'`);
  }
  const keyPart = line.slice(0, brace).trim();
  if (!keyPart.endsWith(":")) {
    throw new SkillSourcesError(`\u7B2C ${lineNo} \u884C\u952E\u987B\u4EE5 ':' \u7ED3\u5C3E: '${line.trim()}'`);
  }
  const token = keyPart.slice(0, -1).trim();
  if (token === "") throw new SkillSourcesError(`\u7B2C ${lineNo} \u884C token \u4E3A\u7A7A`);
  const f = parseFlowBody(line.slice(brace + 1, close), token);
  const tool = f.get("tool");
  if (!tool || !TOOL_SET.has(tool)) {
    throw new SkillSourcesError(`token '${token}' tool \u975E\u6CD5\u6216\u7F3A\u5931: '${tool ?? ""}'\uFF08\u5408\u6CD5\uFF1A${[...TOOL_SET].join("/")}\uFF09`);
  }
  const source = f.get("source");
  if (source === void 0 || source === "") {
    throw new SkillSourcesError(`token '${token}' \u7F3A source`);
  }
  const tier = f.get("tier");
  if (!tier || !TIER_SET.has(tier)) {
    throw new SkillSourcesError(`token '${token}' tier \u975E\u6CD5\u6216\u7F3A\u5931: '${tier ?? ""}'\uFF08\u5408\u6CD5\uFF1A${[...TIER_SET].join("/")}\uFF09`);
  }
  const officialRaw = f.get("official");
  if (officialRaw !== "true" && officialRaw !== "false") {
    throw new SkillSourcesError(`token '${token}' official \u987B\u4E3A true/false: '${officialRaw ?? ""}'`);
  }
  const entry = {
    token,
    tool,
    source,
    tier,
    official: officialRaw === "true"
  };
  const skill = f.get("skill");
  if (skill !== void 0 && skill !== "") entry.skill = skill;
  const engine = f.get("engine");
  if (engine !== void 0 && engine !== "") entry.engine = engine;
  const alt = f.get("alt");
  if (alt !== void 0 && alt !== "") entry.alt = alt;
  const note = f.get("note");
  if (note !== void 0 && note !== "") entry.note = note;
  return entry;
}
function parseSkillSources(text) {
  const lines = text.split("\n");
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  let inSkills = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = stripComment2(raw);
    if (line.trim() === "") continue;
    const indented = /^\s/.test(line);
    if (!inSkills) {
      if (/^skills:\s*$/.test(line)) inSkills = true;
      continue;
    }
    if (!indented) {
      inSkills = false;
      if (/^skills:\s*$/.test(line)) inSkills = true;
      continue;
    }
    const entry = parseEntry(line, i + 1);
    if (seen.has(entry.token)) {
      throw new SkillSourcesError(`token '${entry.token}' \u91CD\u590D\u58F0\u660E\uFF08\u7B2C ${i + 1} \u884C\uFF09`);
    }
    seen.add(entry.token);
    out.push(entry);
  }
  return out;
}
function readSkillSources(path6) {
  try {
    const p = path6 ?? defaultRegistryPath();
    return parseSkillSources(readFileSync16(p, "utf8"));
  } catch {
    return [];
  }
}
function loadSkillSources(path6) {
  let text;
  try {
    text = readFileSync16(path6 ?? defaultRegistryPath(), "utf8");
  } catch (e) {
    return { ok: false, error: `\u8BFB\u53D6 registry \u5931\u8D25: ${e instanceof Error ? e.message : String(e)}` };
  }
  try {
    return { ok: true, sources: parseSkillSources(text) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// packages/cli/src/commands/doctor.ts
var green = (id, detail) => ({ id, status: "green", detail, hint: "" });
var yellow = (id, detail, hint) => ({ id, status: "yellow", detail, hint });
var red = (id, detail, hint) => ({ id, status: "red", detail, hint });
var HOOK_SCRIPTS = ["gate.sh", "breadcrumb.sh", "session-start.sh", "statusline.sh"];
function checkNode(p) {
  const v = p.nodeVersion();
  const major = Number.parseInt(v.replace(/^v/, ""), 10);
  if (Number.isFinite(major) && major >= 22) return green("env:node", `node ${v} \u2265 22`);
  return red("env:node", `node ${v} \u4E0D\u6EE1\u8DB3\u5951\u7EA6 engines.node \u226522`, "\u5347\u7EA7 Node.js \u5230 22+\uFF08\u5982 nvm install 22\uFF09");
}
async function checkGit(p) {
  if (await p.gitAvailable()) return green("env:git", "git \u53EF\u7528\uFF08build_sha \u8BB0\u5F55\u4FDD\u969C\u751F\u6548\uFF09");
  return yellow(
    "env:git",
    "git \u4E0D\u53EF\u7528\u2014\u2014build_sha \u5C06\u9759\u9ED8\u8BB0\u7A7A\uFF08fail-open \u964D\u7EA7\u4E2D\uFF09",
    "\u5B89\u88C5 git \u6216\u5C06\u5176\u52A0\u5165 PATH"
  );
}
function checkManifest(p) {
  const err = p.manifestError();
  if (err === null) {
    return green("asset:manifest", "templates/manifest.yaml \u53EF\u5B9A\u4F4D\u53EF\u89E3\u6790\uFF08\u76F8\u4F4D/\u8F6C\u6362/\u590D\u6838\u76F8\u4F4D\u5355\u4E00\u771F\u76F8\u6E90\uFF09");
  }
  return red(
    "asset:manifest",
    `manifest \u4E0D\u53EF\u7528: ${err}`,
    `\u68C0\u67E5 ${join28(p.pluginRoot, "templates", "manifest.yaml")} \u662F\u5426\u5B58\u5728\u4E14\u7B26\u5408\u7A84 YAML \u5B50\u96C6\uFF08\u89C1\u6587\u4EF6\u5934\u6CE8\u91CA\uFF09`
  );
}
function gateAssetProblems(p) {
  const problems = [];
  if (!p.fileExists(join28(p.pluginRoot, "hooks", "hooks.json"))) problems.push("hooks/hooks.json \u7F3A\u5931");
  const gate = join28(p.pluginRoot, "hooks", "gate.sh");
  if (!p.fileExists(gate)) problems.push("hooks/gate.sh \u7F3A\u5931");
  else if (!p.fileExecutable(gate)) problems.push("hooks/gate.sh \u4E0D\u53EF\u6267\u884C");
  return problems;
}
function checkHookAssets(p) {
  const missing = [];
  if (!p.fileExists(join28(p.pluginRoot, "hooks", "hooks.json"))) missing.push("hooks/hooks.json \u7F3A\u5931");
  for (const s of HOOK_SCRIPTS) {
    const abs = join28(p.pluginRoot, "hooks", s);
    if (!p.fileExists(abs)) missing.push(`hooks/${s} \u7F3A\u5931`);
    else if (!p.fileExecutable(abs)) missing.push(`hooks/${s} \u4E0D\u53EF\u6267\u884C`);
  }
  if (missing.length === 0) return green("asset:hooks", "hooks.json + 4 \u4E2A hook \u811A\u672C\u9F50\u5168\u4E14\u53EF\u6267\u884C");
  return red(
    "asset:hooks",
    `\u63D2\u4EF6\u8D44\u4EA7\u7F3A\u5931/\u4E0D\u53EF\u6267\u884C: ${missing.join("\u3001")}`,
    "\u8865\u9F50\u6587\u4EF6\u6216 chmod +x\uFF1Bbash tools/verify-skills.sh \u53EF\u9010\u6761\u5B9A\u4F4D"
  );
}
function checkGateEffective(p) {
  const problems = gateAssetProblems(p);
  if (problems.length > 0) {
    return red(
      "guard:gate",
      `PreToolUse \u4E09\u95E8\u4E0D\u4F1A\u771F\u62E6: ${problems.join("\u3001")}`,
      "\u4FEE\u590D\u4E0A\u8FF0\u8D44\u4EA7\u540E gate \u624D\u4F1A\u62E6\u622A\uFF08\u8BD5\u7B97\u4F9D\u636E\uFF1Ahooks.json \u6CE8\u518C + gate.sh \u53EF\u6267\u884C\uFF09"
    );
  }
  if (p.env("PIPELINE_AFK") === "1") {
    return yellow(
      "guard:gate",
      "PIPELINE_AFK=1\u2014\u2014\u4E09\u95E8\u65C1\u8DEF\u4E2D\uFF08gate.sh \u6574\u95E8\u653E\u884C\uFF0Cmarker \u4E0D\u62E6\u4E0D\u6E05\uFF09",
      "\u9000\u51FA AFK \u6A21\u5F0F\uFF1Aunset PIPELINE_AFK \u6062\u590D\u4E09\u95E8\u62E6\u622A"
    );
  }
  return green("guard:gate", "PreToolUse \u4E09\u95E8\u4F1A\u771F\u62E6\uFF08hooks.json \u6CE8\u518C + gate.sh \u53EF\u6267\u884C\uFF09");
}
function checkStatusline(p) {
  if (p.statuslineConfigured()) return green("guard:statusline", "statusline \u5DF2\u63A5\u5165 settings\uFF08\u7EC8\u7AEF\u96F6\u5F00\u9500\u72B6\u6001\u751F\u6548\uFF09");
  return yellow(
    "guard:statusline",
    "statusline \u672A\u63A5\u5165 settings\u2014\u2014\u7EC8\u7AEF\u72B6\u6001\u9762\u4E0D\u53EF\u89C1\uFF08\u529F\u80FD\u964D\u7EA7\uFF09",
    `\u5728 ~/.claude/settings.json \u52A0 "statusLine": {"type": "command", "command": "bash ${join28(p.pluginRoot, "hooks", "statusline.sh")}"}`
  );
}
function checkTap(p) {
  if (!p.tapStatus) return green("security:tap", "tap \u6D41\u91CF\u4EE3\u7406\u672A\u88C5\uFF08\u65E0 MITM \u9762\uFF09");
  const s = p.tapStatus();
  if (s.intercepting) {
    return yellow("security:tap", s.message, "tap \u6B63\u5728\u62E6\u622A LLM \u6D41\u91CF\u2014\u2014\u786E\u8BA4\u662F\u4F60\u6709\u610F\u5F00\u542F\uFF1B\u6355\u83B7\u6570\u636E\u4EC5\u843D\u672C\u5730\u4E0D\u5916\u53D1");
  }
  return green("security:tap", s.message);
}
function checkCwd(deps, p) {
  const root = changesRoot(deps.cwd);
  if (p.dirExists(root)) return green("project:cwd", `\u5F53\u524D\u76EE\u5F55\u662F pipeline \u9879\u76EE\uFF08${root} \u5B58\u5728\uFF09`);
  return yellow(
    "project:cwd",
    `${deps.cwd} \u4E0D\u662F pipeline \u9879\u76EE\uFF08openspec/changes \u4E0D\u5B58\u5728\uFF09`,
    "\u5728\u9879\u76EE\u6839\u8FD0\u884C doctor\uFF0C\u6216\u7528 pipeline init <name> --track --preset \u521D\u59CB\u5316"
  );
}
async function checkChanges(deps) {
  const root = changesRoot(deps.cwd);
  const names = await deps.listChanges(root);
  const bad = [];
  for (const name2 of names) {
    try {
      await deps.store.read(join28(root, name2));
    } catch (e) {
      bad.push(`${name2}\uFF08${errMsg(e)}\uFF09`);
    }
  }
  if (bad.length > 0) {
    return red(
      "project:changes",
      `\u574F change ${bad.length} \u4E2A: ${bad.join("\u3001")}`,
      "\u4FEE\u590D\u6216\u79FB\u9664\u5BF9\u5E94 openspec/changes/<name>/.pipeline.yaml"
    );
  }
  return green("project:changes", `${names.length} \u4E2A\u6D3B\u8DC3 change\uFF0C.pipeline.yaml \u5168\u90E8\u53EF\u89E3\u6790`);
}
async function checkMarkers(deps) {
  const markers = await deps.readGateMarkers?.() ?? [];
  const stale = markers.filter((m) => m.ageMs > GATE_TTL_MS[m.kind]);
  if (stale.length > 0) {
    return yellow(
      "project:markers",
      `\u9648\u65E7\u95E8 marker\uFF08\u5DF2\u8FC7\u5404\u81EA\u5206\u7EA7 TTL\uFF0C\u4E0D\u518D\u62E6\u622A\uFF09: ${stale.map((m) => `.pipeline-pending-${m.kind}\uFF08${Math.round(GATE_TTL_MS[m.kind] / 6e4)}min\uFF09`).join("\u3001")}`,
      "rm \u5BF9\u5E94 marker \u5373\u53EF\uFF08\u4E0B\u6B21\u5DE5\u5177\u8C03\u7528 gate.sh \u4E5F\u4F1A\u987A\u624B\u6E05\u6389\uFF09"
    );
  }
  if (markers.length > 0) return green("project:markers", `${markers.length} \u4E2A\u65B0\u9C9C\u95E8 marker\uFF08\u4E09\u95E8\u62E6\u622A\u751F\u6548\u4E2D\uFF09`);
  return green("project:markers", "\u65E0\u95E8 marker\u2014\u2014\u6CA1\u6709\u5F85\u51B3\u4EA4\u4E92");
}
async function checkVerifySkills(p) {
  const { code, output } = await p.runVerifySkills();
  if (code === 0) return green("quality:verify-skills", "verify-skills \u901A\u8FC7\uFF08\u63D2\u4EF6\u8D44\u4EA7\u96F6\u60AC\u7A7A\u5F15\u7528\u4FDD\u969C\u751F\u6548\uFF09");
  const summary = output.trim().split("\n").slice(0, 3).join(" | ");
  return red(
    "quality:verify-skills",
    `verify-skills \u5931\u8D25\uFF08exit ${code}\uFF09: ${summary}`,
    `bash ${join28(p.pluginRoot, "tools", "verify-skills.sh")} \u67E5\u770B\u9010\u6761\u4FEE\u590D\u6307\u5F15`
  );
}
function skillInPlace(entry, byToken, installed) {
  for (const raw of entry.split("|")) {
    const alt = raw.trim();
    if (alt === "") continue;
    const src = byToken.get(alt);
    if (src && (src.tool === "builtin" || src.tool === "bundled")) return true;
    if (installed.has(alt)) return true;
    if (src?.skill !== void 0 && installed.has(src.skill)) return true;
    const colon = alt.indexOf(":");
    if (colon > 0) {
      const prefix = alt.slice(0, colon);
      const suffix = alt.slice(colon + 1);
      if (installed.has(prefix) || installed.has(suffix)) return true;
      const pluginSkill = byToken.get(prefix)?.skill;
      if (pluginSkill !== void 0 && installed.has(pluginSkill)) return true;
    }
  }
  return false;
}
function collectMissingSkills(table, byToken, installed) {
  const seen = /* @__PURE__ */ new Set();
  const missing = [];
  for (const row of Object.values(table)) {
    for (const list of Object.values(row)) {
      for (const entry of list ?? []) {
        if (seen.has(entry)) continue;
        seen.add(entry);
        if (!skillInPlace(entry, byToken, installed)) missing.push(entry);
      }
    }
  }
  return missing;
}
function checkSkills(p) {
  const tables = p.manifestSkills();
  if (tables === null) {
    return [
      yellow("skills:mandatory", "manifest \u4E0D\u53EF\u7528\u2014\u2014\u65E0\u6CD5\u6838\u5F3A\u5236\u6280\u80FD\u9F50\u5168\u5EA6\uFF08\u4E0D\u8BEF\u62A5 green\uFF09", "\u5148\u4FEE\u590D asset:manifest\uFF08templates/manifest.yaml\uFF09\u540E\u91CD\u8DD1 pipeline doctor"),
      yellow("skills:recommended", "manifest \u4E0D\u53EF\u7528\u2014\u2014\u65E0\u6CD5\u6838\u63A8\u8350\u6280\u80FD\u9F50\u5168\u5EA6", "\u5148\u4FEE\u590D asset:manifest \u540E\u91CD\u8DD1 pipeline doctor")
    ];
  }
  const registry = p.fileExists(join28(p.pluginRoot, "templates", "skill-sources.yaml")) ? readSkillSources() : [];
  if (registry.length === 0) {
    return [
      yellow("skills:mandatory", "registry \u672A\u5C31\u7EEA\uFF08templates/skill-sources.yaml \u7F3A\u5931/\u7A7A\uFF09\u2014\u2014\u65E0\u6CD5\u6838\u5F3A\u5236\u6280\u80FD\u9F50\u5168\u5EA6\uFF08\u4E0D\u8BEF\u62A5 green\uFF09", "\u786E\u8BA4\u63D2\u4EF6\u5B89\u88C5\u5B8C\u6574\uFF08skill-sources.yaml \u5E94\u968F\u63D2\u4EF6\u5206\u53D1\uFF09\u540E\u91CD\u8DD1 pipeline doctor"),
      yellow("skills:recommended", "registry \u672A\u5C31\u7EEA\uFF08templates/skill-sources.yaml \u7F3A\u5931/\u7A7A\uFF09\u2014\u2014\u65E0\u6CD5\u6838\u63A8\u8350\u6280\u80FD\u9F50\u5168\u5EA6", "\u786E\u8BA4\u63D2\u4EF6\u5B89\u88C5\u5B8C\u6574\u540E\u91CD\u8DD1 pipeline doctor")
    ];
  }
  const byToken = new Map(registry.map((s) => [s.token, s]));
  const installed = p.installedSkillNames();
  const missMand = collectMissingSkills(tables.mandatory, byToken, installed);
  const missRec = collectMissingSkills(tables.recommended, byToken, installed);
  const mandatory = missMand.length === 0 ? green("skills:mandatory", "\u6240\u6709 manifest \u5F3A\u5236\u6280\u80FD\u5728\u4F4D\uFF08\u963B\u65AD\u51FA\u53E3\u7684\u5F3A\u5236 skill \u5168\u90E8\u53EF\u7528\uFF09") : red(
    "skills:mandatory",
    `\u7F3A ${missMand.length} \u4E2A\u5F3A\u5236\u6280\u80FD\uFF1A${missMand.join("\u3001")}`,
    `\u8DD1 pipeline setup \u5B89\u88C5\u7F3A\u5931\u7684\u5F3A\u5236\u6280\u80FD\uFF08${missMand.join("\u3001")}\uFF09\uFF1B\u88C5\u9F50\u540E\u91CD\u8DD1 pipeline doctor \u590D\u6838`
  );
  const recommended = missRec.length === 0 ? green("skills:recommended", "\u6240\u6709 manifest \u63A8\u8350\u6280\u80FD\u5728\u4F4D") : yellow(
    "skills:recommended",
    `\u7F3A ${missRec.length} \u4E2A\u63A8\u8350\u6280\u80FD\uFF1A${missRec.join("\u3001")}`,
    "pipeline setup \u53EF\u4E00\u5E76\u5B89\u88C5\uFF08\u63A8\u8350\u7F3A\u5931\u53EA\u964D\u7EA7\u3001\u4E0D\u963B\u65AD\u51FA\u53E3\uFF09"
  );
  return [mandatory, recommended];
}
function credDesc(light) {
  if (!light.set) return "\u672A\u914D";
  return `\u5DF2\u914D\uFF08${light.source === "host-env" ? "\u5BBF\u4E3B env" : "secrets \u6587\u4EF6"}\uFF09`;
}
async function checkAfk(p) {
  if (!p.afkReadiness) {
    const miss = (id) => red(id, "AFK \u5C31\u7EEA\u63A2\u9488\u672A\u88C5\u914D\uFF08main.ts \u96C6\u6210\u7F3A\u53E3\uFF0C\u65E0\u6CD5\u8BC4\u4F30 AFK \u8FD0\u884C\u65F6\u5C31\u7EEA\uFF09", "\u6392\u9664\u63A2\u9488\u73AF\u5883\u95EE\u9898\u540E\u91CD\u8DD1 pipeline doctor");
    return [miss("afk:docker"), miss("afk:image"), miss("afk:credential-claude-code"), miss("afk:credential-codex")];
  }
  const r = await p.afkReadiness();
  const docker = r.docker.available ? green("afk:docker", "docker daemon \u53EF\u7528\uFF08AFK \u5BB9\u5668\u6267\u884C\u524D\u7F6E\u5C31\u7EEA\uFF09") : yellow(
    "afk:docker",
    "docker \u4E0D\u53EF\u7528\u2014\u2014AFK \u5BB9\u5668\u6267\u884C\u964D\u7EA7\u4E0D\u53EF\u7528\uFF08\u53EF\u9009\u80FD\u529B\uFF0C\u4E0D\u963B\u65AD\u975E AFK \u6D41\u7A0B\uFF09",
    // 不光说「装 docker」,还引导怎么装（走 kernel PREREQ_HINTS 单一真相源）
    `\u88C5 docker \u5E76\u8D77 daemon \u540E\u91CD\u63A2\uFF08AFK \u975E\u5FC5\u9700\u80FD\u529B\uFF0C\u7F3A\u5B83\u4E0D\u5F71\u54CD\u624B\u52A8\u6D41\u7A0B\uFF09\uFF1B${PREREQ_HINTS.docker}`
  );
  const { configured, present, build_hint } = r.image;
  const image = present ? green("afk:image", `AFK \u955C\u50CF ${configured} \u5728\u4F4D\uFF08\u5BB9\u5668\u53EF\u8D77\uFF09`) : r.docker.available ? yellow("afk:image", `AFK \u955C\u50CF ${configured} \u4E0D\u5728\u672C\u673A\uFF08AFK run \u65E0\u6CD5\u8D77\u5BB9\u5668\uFF09`, `\u6784\u5EFA\u955C\u50CF:${build_hint}`) : yellow(
    "afk:image",
    `docker \u4E0D\u53EF\u7528\uFF0C\u672A\u80FD\u6838 AFK \u955C\u50CF ${configured}`,
    `\u5148\u88C5/\u8D77 docker \u518D\u91CD\u63A2\uFF1B\u7F3A\u955C\u50CF\u65F6\u7528 ${build_hint} \u4E00\u952E\u6784\u5EFA`
  );
  const cc = r.credentials["claude-code"].CLAUDE_CODE_OAUTH_TOKEN;
  const claudeCred = cc.set ? green("afk:credential-claude-code", `claude-code \u51ED\u8BC1 CLAUDE_CODE_OAUTH_TOKEN ${credDesc(cc)}`) : yellow(
    "afk:credential-claude-code",
    "claude-code \u51ED\u8BC1 CLAUDE_CODE_OAUTH_TOKEN \u672A\u914D\uFF08AFK \u8DD1 claude-code runner \u4F1A\u7F3A\u9274\u6743\uFF09",
    // 不光说「去配」,还引导怎么拿——生成长期 OAuth token（走 kernel PREREQ_HINTS 单一真相源）
    `\u53BB\u914D CLAUDE_CODE_OAUTH_TOKEN\uFF08pipeline \u673A\u5668\u7EA7 secrets \u6216\u5BBF\u4E3B env\uFF1B\u7EC8\u7AEF doctor/setup \u4E3A\u51ED\u8BC1\u6743\u5A01\uFF09\uFF1B\u600E\u4E48\u62FF\uFF1A${PREREQ_HINTS.claudeToken}`
  );
  const oa = r.credentials.codex.OPENAI_API_KEY;
  const ch = r.credentials.codex.CODEX_HOME;
  const codexCred = oa.set ? green("afk:credential-codex", `codex \u51ED\u8BC1 OPENAI_API_KEY ${credDesc(oa)}\uFF1BCODEX_HOME ${credDesc(ch)}`) : yellow(
    "afk:credential-codex",
    `codex \u51ED\u8BC1 OPENAI_API_KEY \u672A\u914D\uFF08AFK \u8DD1 codex runner \u4F1A\u7F3A\u9274\u6743\uFF09\uFF1BCODEX_HOME ${credDesc(ch)}`,
    // 不光说「去配」,还引导两条路——codex login 走 ChatGPT / 建 openai api-key（走 kernel PREREQ_HINTS 单一真相源）
    `\u53BB\u914D OPENAI_API_KEY\uFF08pipeline \u673A\u5668\u7EA7 secrets \u6216\u5BBF\u4E3B env\uFF1BCODEX_HOME \u53EF\u9009,\u7F3A\u7701 ~/.codex\uFF09\uFF1B\u600E\u4E48\u62FF\uFF1A${PREREQ_HINTS.openaiKey}`
  );
  return [docker, image, claudeCred, codexCred];
}
var STATUS_TAG = { green: "[PASS]", yellow: "[WARN]", red: "[FAIL]" };
async function cmdDoctor(deps, opts) {
  const p = deps.doctor;
  if (!p) {
    deps.io.err("ERROR: doctor \u63A2\u9488\u672A\u88C5\u914D\uFF08main.ts \u96C6\u6210\u7F3A\u53E3\uFF0C\u65E0\u6CD5\u8BC4\u4F30\u4FDD\u969C\u751F\u6548\u6027\uFF09");
    return 1;
  }
  const runners = [
    ["env:node", () => checkNode(p)],
    ["env:git", () => checkGit(p)],
    ["asset:manifest", () => checkManifest(p)],
    ["asset:hooks", () => checkHookAssets(p)],
    ["guard:gate", () => checkGateEffective(p)],
    ["guard:statusline", () => checkStatusline(p)],
    ["security:tap", () => checkTap(p)],
    ["project:cwd", () => checkCwd(deps, p)],
    ["project:changes", () => checkChanges(deps)],
    ["project:markers", () => checkMarkers(deps)],
    ["quality:verify-skills", () => checkVerifySkills(p)]
  ];
  const checks = [];
  for (const [id, run] of runners) {
    try {
      checks.push(await run());
    } catch (e) {
      checks.push(red(id, `\u68C0\u67E5\u81EA\u8EAB\u5F02\u5E38: ${errMsg(e)}`, "\u6392\u9664\u63A2\u9488\u73AF\u5883\u95EE\u9898\u540E\u91CD\u8DD1 pipeline doctor"));
    }
  }
  try {
    const [mand, rec] = checkSkills(p);
    checks.push(mand, rec);
  } catch (e) {
    const m = errMsg(e);
    checks.push(
      red("skills:mandatory", `\u68C0\u67E5\u81EA\u8EAB\u5F02\u5E38: ${m}`, "\u6392\u9664\u63A2\u9488\u73AF\u5883\u95EE\u9898\u540E\u91CD\u8DD1 pipeline doctor"),
      red("skills:recommended", `\u68C0\u67E5\u81EA\u8EAB\u5F02\u5E38: ${m}`, "\u6392\u9664\u63A2\u9488\u73AF\u5883\u95EE\u9898\u540E\u91CD\u8DD1 pipeline doctor")
    );
  }
  try {
    const [dk, im, cc, cx] = await checkAfk(p);
    checks.push(dk, im, cc, cx);
  } catch (e) {
    const m = errMsg(e);
    for (const id of ["afk:docker", "afk:image", "afk:credential-claude-code", "afk:credential-codex"]) {
      checks.push(red(id, `\u68C0\u67E5\u81EA\u8EAB\u5F02\u5E38: ${m}`, "\u6392\u9664\u63A2\u9488\u73AF\u5883\u95EE\u9898\u540E\u91CD\u8DD1 pipeline doctor"));
    }
  }
  const summary = {
    green: checks.filter((c) => c.status === "green").length,
    yellow: checks.filter((c) => c.status === "yellow").length,
    red: checks.filter((c) => c.status === "red").length
  };
  const exit = summary.red > 0 ? 1 : 0;
  if (opts.json) {
    deps.io.out(JSON.stringify({ checks, summary }));
    return exit;
  }
  deps.io.out(`[DOCTOR] \u4FDD\u969C\u751F\u6548\u9762 ${checks.length} \u9879 \u2014\u2014 \u7EFF ${summary.green} / \u9EC4 ${summary.yellow} / \u7EA2 ${summary.red}`);
  const idW = Math.max(...checks.map((c) => c.id.length));
  for (const c of checks) {
    deps.io.out(`  ${STATUS_TAG[c.status]} ${c.id.padEnd(idW)}  ${c.detail}`);
    if (c.status !== "green" && c.hint !== "") deps.io.out(`${" ".repeat(9 + idW + 2)}fix: ${c.hint}`);
  }
  return exit;
}

// packages/cli/src/commands/fields.ts
async function recordHistory(deps, dir, entry) {
  if (!deps.history) return;
  try {
    await deps.history.append(dir, entry);
  } catch (e) {
    deps.io.err(`WARN: history \u5199\u5165\u5931\u8D25: ${errMsg(e)}`);
  }
}
var REVIEWISH = ["pending", "pass", "fail", "handled", "skipped"];
var STATIC_ENUMS = {
  track: TRACKS,
  preset: ["full", "hotfix", "tweak"],
  phase_status: ["pending", "in_progress", "done", "failed"],
  build_mode: ["direct", "subagent-driven-development", "parallel-team", "prototype"],
  isolation: ["branch", "worktree"],
  agent_review_result: REVIEWISH,
  codex_review_result: REVIEWISH,
  verify_result: REVIEWISH,
  branch_status: REVIEWISH,
  direct_override: ["true", "false"],
  archived: ["true", "false"],
  automation: ["off", "queued", "scheduled", "running", "merged", "failed", "conflict", "paused"]
};
function enumOk(deps, field2, value) {
  if (Array.isArray(value)) return true;
  const allowed = field2 === "phase" ? deps.flow.manifest.phases : STATIC_ENUMS[field2];
  if (!allowed || allowed.includes(value)) return true;
  deps.io.err(`ERROR: \u975E\u6CD5\u503C '${value}'\uFF0C\u5141\u8BB8: ${allowed.join(" ")}`);
  return false;
}
function asField(deps, field2) {
  if (FIELD_ORDER.includes(field2)) return field2;
  deps.io.err(`ERROR: \u672A\u77E5\u5B57\u6BB5: ${field2}`);
  return void 0;
}
function checkName(deps, name2) {
  if (isValidChangeName(name2)) return true;
  deps.io.err(`ERROR: change-name \u975E\u6CD5: '${name2}' (\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _)`);
  return false;
}
function isListField(field2) {
  return LIST_FIELDS.includes(field2);
}
function splitList(raw) {
  return raw.split(",").map((s) => s.trim()).filter((s) => s !== "");
}
function coerceValue(field2, raw) {
  return isListField(field2) ? splitList(raw) : raw;
}
async function cmdGet(deps, name2, field2) {
  if (!checkName(deps, name2)) return 1;
  try {
    const state = await deps.store.read(changeDir(deps.cwd, name2));
    const known = FIELD_ORDER.includes(field2);
    const v = known ? state.fields[field2] : void 0;
    deps.io.out(v === void 0 ? "" : Array.isArray(v) ? v.join(",") : v);
    return 0;
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`);
    return 1;
  }
}
async function cmdSet(deps, name2, field2, value) {
  if (!checkName(deps, name2)) return 1;
  const f = asField(deps, field2);
  if (!f) return 1;
  const v = coerceValue(f, value);
  if (!enumOk(deps, f, v)) return 1;
  const dir = changeDir(deps.cwd, name2);
  try {
    await deps.store.set(dir, f, v);
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`);
    return 1;
  }
  await recordHistory(deps, dir, {
    ts: deps.clock(),
    kind: "set",
    field: f,
    to: Array.isArray(v) ? v.join(",") : v
  });
  return 0;
}
async function cmdSetMany(deps, name2, pairs) {
  if (!checkName(deps, name2)) return 1;
  const kv = {};
  for (const pair of pairs) {
    const i = pair.indexOf("=");
    if (i <= 0) {
      deps.io.err(`ERROR: kv \u683C\u5F0F\u9519\u8BEF(\u7F3A '=' \u6216\u952E\u4E3A\u7A7A): ${pair}`);
      return 1;
    }
    const f = asField(deps, pair.slice(0, i));
    if (!f) return 1;
    if (Object.hasOwn(kv, f)) {
      deps.io.err(`ERROR: set-many \u91CD\u590D\u5B57\u6BB5 '${f}'\uFF08\u540C\u952E\u591A\u6B21\u8D4B\u503C\uFF0C\u62D2\u5199\u4EE5\u514D\u9759\u9ED8 last-wins\uFF09`);
      return 1;
    }
    const v = coerceValue(f, pair.slice(i + 1));
    if (!enumOk(deps, f, v)) return 1;
    kv[f] = v;
  }
  if (Object.keys(kv).length === 0) {
    deps.io.err("ERROR: set-many \u81F3\u5C11\u9700\u8981 1 \u4E2A key=value");
    return 1;
  }
  const dir = changeDir(deps.cwd, name2);
  try {
    await deps.store.setMany(dir, kv);
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`);
    return 1;
  }
  for (const [f, v] of Object.entries(kv)) {
    await recordHistory(deps, dir, {
      ts: deps.clock(),
      kind: "set",
      field: f,
      to: Array.isArray(v) ? v.join(",") : v
    });
  }
  return 0;
}
async function cmdCas(deps, name2, field2, expect, next) {
  if (!checkName(deps, name2)) return 1;
  const f = asField(deps, field2);
  if (!f) return 1;
  if (f === "automation" && !enumOk(deps, f, next)) return 1;
  const dir = changeDir(deps.cwd, name2);
  let ok;
  try {
    ok = await deps.store.cas(dir, f, expect, next);
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`);
    return 1;
  }
  if (!ok) return 3;
  await recordHistory(deps, dir, { ts: deps.clock(), kind: "set", field: f, from: expect, to: next });
  return 0;
}

// packages/cli/src/commands/import.ts
async function cmdImport(deps, name2, opts) {
  if (!isValidChangeName(name2)) {
    deps.io.err(`ERROR: change-name \u975E\u6CD5: '${name2}' (\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _)`);
    return 1;
  }
  if (!deps.history) {
    deps.io.err("ERROR: import \u9700\u8981 history writer\uFF08main.ts \u88C5\u914D\u7F3A\u5931\uFF1F\uFF09");
    return 1;
  }
  const dir = changeDir(deps.cwd, name2);
  try {
    const state = await deps.store.read(dir);
    const entries = parseLegacyHistory(state.opaqueTail);
    if (entries.length === 0) {
      deps.io.err(`[IMPORT] ${name2}: \u65E0\u5386\u53F2\u533A\u53EF\u5BFC\u5165`);
      return 0;
    }
    const prior = await deps.readHistoryRaw?.(dir) ?? "";
    const alreadyImported = prior.split("\n").some((line) => {
      const t = line.trim();
      if (t === "") return false;
      try {
        return JSON.parse(t).kind === "import";
      } catch {
        return false;
      }
    });
    if (alreadyImported) {
      deps.io.err(`ERROR: ${name2} \u5DF2\u5BFC\u5165\u8FC7\uFF08.pipeline-history.jsonl \u5B58\u5728 import \u54E8\u5175\uFF09\uFF0C\u62D2\u7EDD\u91CD\u590D\u5BFC\u5165`);
      return 1;
    }
    for (const e of entries) {
      await deps.history.append(dir, e);
    }
    await deps.history.append(dir, {
      ts: deps.clock(),
      kind: "import",
      raw: `legacy-yaml: ${entries.length} entries`
    });
    if (opts.strip) {
      await deps.store.write(dir, { ...state, opaqueTail: stripLegacyHistory(state.opaqueTail) });
    }
    deps.io.err(
      `[IMPORT] ${name2}: ${entries.length} \u6761\u5386\u53F2 \u2192 .pipeline-history.jsonl${opts.strip ? "\uFF08\u5DF2\u6E05\u7406 YAML \u5386\u53F2\u533A\uFF09" : ""}`
    );
    return 0;
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`);
    return 1;
  }
}

// packages/cli/src/commands/inbox.ts
import { join as join29 } from "node:path";
function fmtDuration(s) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${m % 60 ? `${m % 60}m` : ""}`;
}
var REVIEW_HINT = "\u5B8C\u6210\u8BE5\u76F8\u4F4D\u4EA7\u51FA\u540E\u7528 AskUserQuestion \u4EA4\u7528\u6237\u590D\u6838";
function escapeHtml(s) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function renderHtml(items, generatedAt) {
  const rows = items.map(
    (i) => `<tr><td class="n">${escapeHtml(i.name)}</td><td>${escapeHtml(i.phase)}</td><td class="w">${fmtDuration(i.waiting_s)}</td><td><span class="b">${escapeHtml(i.waiting_on)}</span> ${escapeHtml(i.hint)}</td></tr>`
  ).join("\n");
  const body = items.length === 0 ? '<p class="empty">\u6536\u4EF6\u7BB1\u7A7A\u2014\u2014\u6CA1\u6709\u5728\u7B49\u4F60\u7684\u4E8B\u3002</p>' : `<table><thead><tr><th>CHANGE</th><th>PHASE</th><th>\u7B49\u5F85</th><th>\u5728\u7B49\u4EC0\u4E48</th></tr></thead><tbody>
${rows}
</tbody></table>`;
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>pipeline \u6536\u4EF6\u7BB1</title>
<style>
:root{color-scheme:light dark;--ink:#1a1a1a;--paper:#fff;--line:#e2e2e2;--dim:#6b6b6b;--badge:#eef2ff;--badge-ink:#3730a3}
@media(prefers-color-scheme:dark){:root{--ink:#e6e6e6;--paper:#141414;--line:#333;--dim:#9a9a9a;--badge:#1e2350;--badge-ink:#c7d2fe}}
body{margin:2rem auto;max-width:52rem;padding:0 1rem;font:15px/1.6 system-ui,sans-serif;color:var(--ink);background:var(--paper)}
h1{font-size:1.2rem}small{color:var(--dim)}
table{border-collapse:collapse;width:100%;margin-top:1rem}
th,td{text-align:left;padding:.5rem .75rem;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:.75rem;letter-spacing:.05em;color:var(--dim)}
.n{font-weight:600;font-family:ui-monospace,monospace}.w{white-space:nowrap;font-variant-numeric:tabular-nums}
.b{display:inline-block;padding:0 .5em;border-radius:.6em;background:var(--badge);color:var(--badge-ink);font-size:.8em;font-family:ui-monospace,monospace}
.empty{color:var(--dim);margin-top:2rem}
</style></head><body>
<h1>pipeline \u6536\u4EF6\u7BB1 <small>\u751F\u6210\u4E8E ${escapeHtml(generatedAt)} \xB7 \u5FEB\u7167\uFF08\u91CD\u8DD1 inbox --html \u5237\u65B0\uFF09</small></h1>
${body}
</body></html>`;
}
async function cmdInbox(deps, opts) {
  const items = [];
  const seen = /* @__PURE__ */ new Set();
  const markers = await deps.readGateMarkers?.() ?? [];
  for (const m of markers) {
    if (m.ageMs > GATE_TTL_MS[m.kind]) continue;
    const [phase = "?", hint = "", name2 = "?"] = m.raw.split("\n");
    items.push({
      name: name2,
      phase,
      waiting_on: `gate:${m.kind}`,
      waiting_s: Math.floor(m.ageMs / 1e3),
      hint
    });
    seen.add(name2);
  }
  const now = Date.parse(deps.clock());
  const changesRoot2 = join29(deps.cwd, "openspec", "changes");
  for (const name2 of await deps.listChanges(changesRoot2)) {
    if (seen.has(name2)) continue;
    let fields;
    try {
      fields = (await deps.store.read(join29(changesRoot2, name2))).fields;
    } catch (e) {
      deps.io.err(`WARN: \u8DF3\u8FC7\u574F change ${name2}: ${errMsg(e)}`);
      continue;
    }
    if (str(fields.archived) === "true") continue;
    const phase = str(fields.phase);
    if (!deps.flow.manifest.reviewPhases.includes(phase)) continue;
    if (str(fields.phase_status) === "done") continue;
    const updated = Date.parse(str(fields.updated_at));
    const waitingS = Number.isNaN(updated) ? 0 : Math.max(0, Math.floor((now - updated) / 1e3));
    items.push({ name: name2, phase, waiting_on: "phase-review", waiting_s: waitingS, hint: REVIEW_HINT });
  }
  items.sort((a, b) => b.waiting_s - a.waiting_s);
  if (opts.json) {
    deps.io.out(JSON.stringify({ inbox: items }));
    return 0;
  }
  if (opts.html) {
    deps.io.out(renderHtml(items, deps.clock()));
    return 0;
  }
  if (items.length === 0) {
    deps.io.out("\u6536\u4EF6\u7BB1\u7A7A\u2014\u2014\u6CA1\u6709\u5728\u7B49\u4F60\u7684\u4E8B\u3002");
    return 0;
  }
  const nameW = Math.max(6, ...items.map((i) => i.name.length));
  const phaseW = Math.max(5, ...items.map((i) => i.phase.length));
  const waitW = Math.max(4, ...items.map((i) => fmtDuration(i.waiting_s).length));
  deps.io.out(`${"CHANGE".padEnd(nameW)}  ${"PHASE".padEnd(phaseW)}  ${"\u7B49\u5F85".padEnd(waitW)}  \u5728\u7B49\u4EC0\u4E48`);
  for (const i of items) {
    deps.io.out(
      `${i.name.padEnd(nameW)}  ${i.phase.padEnd(phaseW)}  ${fmtDuration(i.waiting_s).padEnd(waitW)}  [${i.waiting_on}] ${i.hint}`
    );
  }
  return 0;
}

// packages/cli/src/commands/transition.ts
function reviewHint(phase) {
  switch (phase) {
    case "explore":
      return "design_doc\uFF08\u6DF1\u5EA6\u8BBE\u8BA1 / \u8C03\u7814 + \u5173\u952E\u51B3\u7B56\uFF09";
    case "spec":
      return "plan / \u7528\u6237\u65C5\u7A0B / delta spec\uFF08\u5B9E\u65BD\u8BA1\u5212\uFF09";
    case "verify":
      return "verification_report\uFF08\u9A8C\u8BC1\u7ED3\u8BBA\uFF09";
    default:
      return "\uFF08\u5F85\u590D\u6838\uFF09";
  }
}
var EventPreconditionError = class extends Error {
  constructor(lines) {
    super(lines[0] ?? "transition \u524D\u7F6E\u6821\u9A8C\u4E0D\u6EE1\u8DB3");
    this.lines = lines;
  }
  lines;
};
var UnknownEventError = class extends Error {
  constructor(event) {
    super(`\u672A\u77E5 event: ${event}`);
    this.event = event;
  }
  event;
};
var WorkflowError = class extends Error {
};
var StepGuardError = class extends Error {
  constructor(lines) {
    super(lines[0] ?? "step guard \u672A\u901A\u8FC7");
    this.lines = lines;
  }
  lines;
};
async function cmdTransition(deps, name2, event) {
  if (!isValidChangeName(name2)) {
    deps.io.err(`ERROR: change-name \u975E\u6CD5: '${name2}' (\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _)`);
    return 1;
  }
  const dir = changeDir(deps.cwd, name2);
  const txnCtx = {
    fileExists: deps.guardCtx?.(name2)?.fileExists,
    gitHeadSha: deps.gitHeadSha
  };
  let outcome;
  try {
    outcome = await deps.store.withLock(dir, async () => {
      const state = await deps.store.read(dir);
      const workflowName = resolveWorkflowName(state);
      if (workflowName === "default") {
        const edge = eventEdge(event);
        if (!edge) throw new UnknownEventError(event);
        const current = str(state.fields.phase);
        if (current !== edge.from) {
          throw new IllegalTransitionError(current, edge.to);
        }
        const violations = await checkTransitionPreconditions(event, state, txnCtx);
        if (violations) throw new EventPreconditionError(violations);
        const r = deps.flow.transition(state, edge.to, deps.clock);
        const eff = await applyTransitionEffects(event, r.state, deps.clock, txnCtx);
        if (eff.buildShaMissing) {
          deps.io.err("WARN: build-complete \u672A\u53D6\u5230 git HEAD\uFF08\u975E git \u4ED3\uFF1F\uFF09build_sha \u7559\u7A7A\uFF0Cverify \u4E0D\u505A SHA \u6821\u9A8C");
        }
        await deps.store.write(dir, r.state);
        return { workflow: "default", result: r };
      }
      const wf = loadWorkflow(deps.cwd, workflowName);
      if (!wf) {
        throw new WorkflowError(`ERROR: workflow '${workflowName}' \u672A\u627E\u5230\uFF08\u671F\u671B .pipeline/workflows/${workflowName}.yaml\uFF09`);
      }
      const plan = planStepTransition(wf, state, event, { changeDirAbs: dir });
      if (!plan.ok) {
        if (plan.kind === "step-not-in-graph") {
          throw new WorkflowError(`ERROR: step '${plan.stepId}' \u4E0D\u5728 workflow '${workflowName}' \u91CC`);
        }
        if (plan.kind === "event-unsupported") {
          const available = plan.available.join(", ") || "(\u65E0)";
          throw new WorkflowError(
            `ERROR: step '${plan.stepId}' \u4E0D\u652F\u6301 event '${event}'\uFF1B\u8BE5 step \u652F\u6301\uFF1A${available}`
          );
        }
        throw new StepGuardError([`ERROR: step '${plan.stepId}' guard \u672A\u901A\u8FC7\uFF1A`, ...plan.failures]);
      }
      await deps.store.write(dir, applyStepTransition(state, plan.to, deps.clock));
      return { workflow: "custom", from: plan.from, to: plan.to };
    });
  } catch (e) {
    if (e instanceof EventPreconditionError) {
      for (const line of e.lines) deps.io.err(line);
      return 1;
    }
    if (e instanceof IllegalTransitionError) {
      deps.io.err(`ERROR: ${e.message}`);
      return 1;
    }
    if (e instanceof UnknownEventError) {
      deps.io.err(`ERROR: \u672A\u77E5 event: ${event}`);
      return 1;
    }
    if (e instanceof WorkflowError) {
      deps.io.err(e.message);
      return 1;
    }
    if (e instanceof StepGuardError) {
      for (const line of e.lines) deps.io.err(line);
      return 2;
    }
    deps.io.err(`ERROR: ${errMsg(e)}`);
    return 1;
  }
  if (outcome.workflow === "custom") {
    if (deps.history) {
      try {
        await deps.history.append(dir, {
          ts: deps.clock(),
          kind: "transition",
          from: outcome.from,
          to: outcome.to,
          raw: event
        });
      } catch (e) {
        deps.io.err(`WARN: history \u5199\u5165\u5931\u8D25: ${errMsg(e)}`);
      }
    }
    deps.io.err(`[TRANSITION] ${name2}: ${outcome.from} -> ${outcome.to}`);
    return 0;
  }
  const result = outcome.result;
  if (deps.writeBreadcrumb) {
    try {
      await deps.writeBreadcrumb(dir, `pipeline:${name2} phase=${result.to}
`);
    } catch (e) {
      deps.io.err(`WARN: breadcrumb \u5199\u5165\u5931\u8D25: ${errMsg(e)}`);
    }
  }
  if (deps.history) {
    try {
      await deps.history.append(dir, {
        ts: deps.clock(),
        kind: "transition",
        from: result.from,
        to: result.to,
        raw: event
        // 老仓 transitions_history.event 对位（与 legacy.ts 导入映射同口径）
      });
    } catch (e) {
      deps.io.err(`WARN: history \u5199\u5165\u5931\u8D25: ${errMsg(e)}`);
    }
  }
  if (deps.writeReviewMarker && deps.flow.manifest.reviewPhases.includes(result.to)) {
    try {
      await deps.writeReviewMarker(`${result.to}
${reviewHint(result.to)}
${name2}
`);
    } catch (e) {
      deps.io.err(`WARN: review marker \u5199\u5165\u5931\u8D25: ${errMsg(e)}`);
    }
  }
  deps.io.err(`[TRANSITION] ${name2}: ${result.from} -> ${result.to}`);
  return 0;
}

// packages/cli/src/commands/advance.ts
var DEFAULT_MAX_STEPS = 12;
var HARD_GATES = ["confirm", "interaction"];
function forwardStep(deps, current) {
  const phases = deps.flow.manifest.phases;
  const idx = phases.indexOf(current);
  if (idx < 0) return void 0;
  const targets2 = deps.flow.manifest.transitions[current] ?? [];
  const to = targets2.find((t) => phases.indexOf(t) > idx);
  if (to === void 0) return void 0;
  const entry = Object.entries(TRANSITION_EVENTS).find(([, e]) => e.from === current && e.to === to);
  return entry ? { event: entry[0], to } : void 0;
}
async function freshHardGate(deps) {
  const markers = await deps.readGateMarkers?.() ?? [];
  for (const m of markers) {
    if (HARD_GATES.includes(m.kind) && m.ageMs <= GATE_TTL_MS[m.kind]) return m.kind;
  }
  return void 0;
}
async function guardQuietly(deps, name2) {
  const lines = [];
  const sub = { ...deps, io: { out: (l) => lines.push(l), err: (l) => lines.push(l) } };
  const code = await cmdCheck(sub, name2);
  return { code, lines };
}
async function transitionQuietly(deps, name2, event) {
  const lines = [];
  const sub = { ...deps, io: { out: (l) => lines.push(l), err: (l) => lines.push(l) } };
  const code = await cmdTransition(sub, name2, event);
  return { code, lines };
}
function isReviewPhase(deps, phase) {
  return deps.flow.manifest.reviewPhases.includes(phase);
}
async function cmdAdvance(deps, name2, opts = {}) {
  if (!isValidChangeName(name2)) {
    deps.io.err(`ERROR: change-name \u975E\u6CD5: '${name2}' (\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _)`);
    return 1;
  }
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
  const through = opts.throughGates ?? false;
  let startPhase;
  let workflowName;
  try {
    const state = await deps.store.read(changeDir(deps.cwd, name2));
    startPhase = str(state.fields.phase);
    workflowName = resolveWorkflowName(state);
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`);
    return 1;
  }
  if (workflowName !== "default") {
    return cmdAdvanceCustom(deps, name2, workflowName, startPhase, through, maxSteps, opts.dryRun ?? false);
  }
  if (opts.dryRun) return dryRunPlan(deps, name2, startPhase, through, maxSteps);
  deps.io.out(`[ADVANCE] ${name2}: \u4ECE ${startPhase} \u8D77\u6B65\uFF08max-steps=${maxSteps}${through ? "\uFF0Cthrough-gates" : ""}\uFF09`);
  let current = startPhase;
  let steps = 0;
  for (; ; ) {
    const fwd = forwardStep(deps, current);
    if (!fwd) {
      deps.io.out(`[STOP] ${name2} @ ${current}: \u5DF2\u5230\u7EC8\u6001\uFF0C\u65E0\u540E\u7EE7\u4E8B\u4EF6\uFF08\u63A8\u8FDB\u5B8C\u6210\uFF09`);
      return 0;
    }
    const hard = await freshHardGate(deps);
    if (hard) {
      deps.io.out(`[STOP] ${name2} @ ${current}: \u786C\u95E8 .pipeline-pending-${hard} \u65B0\u9C9C\u5B58\u5728\u2014\u2014\u4E09\u95E8\u7EDD\u4E0D\u81EA\u52A8\u8DE8\u8D8A\uFF08HITL \u7EA2\u7EBF\uFF09`);
      return 0;
    }
    if (!through && isReviewPhase(deps, current)) {
      deps.io.out(`[STOP] ${name2} @ ${current}: \u590D\u6838\u76F8\u4F4D\uFF08HITL \u95E8\uFF09\uFF0C\u505C\u7ED9\u4EBA\u590D\u6838\u2014\u2014--through-gates \u53EF\u663E\u5F0F\u653E\u884C`);
      return 0;
    }
    if (steps >= maxSteps) {
      deps.io.out(`[STOP] ${name2} @ ${current}: \u8FBE\u5230 --max-steps=${maxSteps} \u4E0A\u9650\uFF0C\u505C\uFF08\u9632\u5931\u63A7\u4FDD\u9669\u4E1D\uFF09`);
      return 0;
    }
    const g = await guardQuietly(deps, name2);
    if (g.code !== 0) {
      deps.io.out(`[STOP] ${name2} @ ${current}: guard \u672A\u901A\u8FC7\uFF0C\u505C\uFF08\u4FEE\u590D\u540E\u91CD\u8BD5\uFF09`);
      for (const l of g.lines) if (l.includes("[FAIL]")) deps.io.out(`  ${l.trim()}`);
      return g.code === 2 ? 2 : 1;
    }
    const t = await transitionQuietly(deps, name2, fwd.event);
    if (t.code !== 0) {
      deps.io.out(`[STOP] ${name2} @ ${current}: transition ${fwd.event} \u5931\u8D25\uFF0C\u505C`);
      for (const l of t.lines) deps.io.out(`  ${l.trim()}`);
      return 1;
    }
    deps.io.out(`[ADVANCE] ${name2}: ${current} -> ${fwd.to}\uFF08${fwd.event}\uFF09`);
    current = fwd.to;
    steps += 1;
  }
}
async function dryRunPlan(deps, name2, start, through, maxSteps) {
  deps.io.out(`[DRY-RUN] ${name2}: \u8BA1\u5212\u9884\u89C8\uFF08\u4E0D\u6539\u76D8\uFF09\u4ECE ${start} \u8D77\uFF08max-steps=${maxSteps}${through ? "\uFF0Cthrough-gates" : ""}\uFF09`);
  const hard = await freshHardGate(deps);
  if (hard) {
    deps.io.out(`  \u9884\u8BA1\u505C\u5728 ${start}: \u786C\u95E8 .pipeline-pending-${hard} \u65B0\u9C9C\u5B58\u5728\uFF0C\u7EDD\u4E0D\u81EA\u52A8\u8DE8\u8D8A\uFF08HITL \u7EA2\u7EBF\uFF09`);
    return 0;
  }
  if (!through && isReviewPhase(deps, start)) {
    deps.io.out(`  \u9884\u8BA1\u505C\u5728 ${start}: \u590D\u6838\u76F8\u4F4D\uFF08HITL \u95E8\uFF0C--through-gates \u653E\u884C\uFF09`);
    return 0;
  }
  if (!forwardStep(deps, start)) {
    deps.io.out(`  \u9884\u8BA1\u505C\u5728 ${start}: \u5DF2\u5230\u7EC8\u6001`);
    return 0;
  }
  const g = await guardQuietly(deps, name2);
  if (g.code !== 0) {
    deps.io.out(`  guard@${start} \u672A\u901A\u8FC7 \u2192 \u9884\u8BA1\u505C\u5728 ${start}\uFF08\u4E0D\u63A8\u8FDB\uFF09`);
    for (const l of g.lines) if (l.includes("[FAIL]")) deps.io.out(`  ${l.trim()}`);
    return 0;
  }
  deps.io.out(`  guard@${start}: \u901A\u8FC7`);
  let current = start;
  let steps = 0;
  const visited = /* @__PURE__ */ new Set();
  while (steps < maxSteps) {
    const fwd = forwardStep(deps, current);
    if (!fwd) {
      deps.io.out(`  \u9884\u8BA1\u505C\u5728 ${current}: \u5DF2\u5230\u7EC8\u6001`);
      return 0;
    }
    deps.io.out(`  \u8BA1\u5212 ${steps + 1}: ${current} -> ${fwd.to}\uFF08${fwd.event}\uFF09${steps === 0 ? "" : "  [live-guard]"}`);
    visited.add(current);
    current = fwd.to;
    steps += 1;
    if (!through && isReviewPhase(deps, current)) {
      deps.io.out(`  \u9884\u8BA1\u505C\u5728 ${current}: \u590D\u6838\u76F8\u4F4D\uFF08HITL \u95E8\uFF0C--through-gates \u653E\u884C\uFF09`);
      return 0;
    }
    if (visited.has(current)) {
      deps.io.out(`  \u9884\u8BA1\u505C\u5728 ${current}: \u68C0\u6D4B\u5230\u73AF\uFF0C\u505C`);
      return 0;
    }
  }
  deps.io.out(`  \u9884\u8BA1\u5728 ${current} \u89E6\u53CA --max-steps=${maxSteps} \u4E0A\u9650`);
  return 0;
}
async function cmdAdvanceCustom(deps, name2, workflowName, startPhase, through, maxSteps, dryRun) {
  let wf;
  try {
    wf = loadWorkflow(deps.cwd, workflowName);
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`);
    return 1;
  }
  if (!wf) {
    deps.io.err(`ERROR: workflow '${workflowName}' \u672A\u627E\u5230\uFF08\u671F\u671B .pipeline/workflows/${workflowName}.yaml\uFF09`);
    return 1;
  }
  if (!resolveStep(wf, startPhase)) {
    deps.io.err(`ERROR: step '${startPhase}' \u4E0D\u5728 workflow '${workflowName}' \u91CC`);
    return 1;
  }
  if (dryRun) return dryRunCustomPlan(deps, name2, wf, workflowName, startPhase, through, maxSteps);
  deps.io.out(`[ADVANCE] ${name2}: \u4ECE ${startPhase} \u8D77\u6B65\uFF08max-steps=${maxSteps}${through ? "\uFF0Cthrough-gates" : ""}\uFF09`);
  let current = startPhase;
  let steps = 0;
  for (; ; ) {
    const step = resolveStep(wf, current);
    if (!step) {
      deps.io.err(`ERROR: step '${current}' \u4E0D\u5728 workflow '${workflowName}' \u91CC`);
      return 1;
    }
    if (step.transitions.length === 0) {
      deps.io.out(`[STOP] ${name2} @ ${current}: \u5DF2\u5230\u7EC8\u6001\uFF0C\u65E0\u540E\u7EE7\u4E8B\u4EF6\uFF08\u63A8\u8FDB\u5B8C\u6210\uFF09`);
      return 0;
    }
    const hard = await freshHardGate(deps);
    if (hard) {
      deps.io.out(`[STOP] ${name2} @ ${current}: \u786C\u95E8 .pipeline-pending-${hard} \u65B0\u9C9C\u5B58\u5728\u2014\u2014\u4E09\u95E8\u7EDD\u4E0D\u81EA\u52A8\u8DE8\u8D8A\uFF08HITL \u7EA2\u7EBF\uFF09`);
      return 0;
    }
    if (step.gate === "confirm") {
      deps.io.out(`[STOP] ${name2} @ ${current}: step gate 'confirm'\uFF08human gate\uFF09\u2014\u2014\u7EDD\u4E0D\u81EA\u52A8\u8DE8\u8D8A\uFF08HITL \u7EA2\u7EBF\uFF09`);
      return 0;
    }
    if (step.gate === "review" && !through) {
      deps.io.out(`[STOP] ${name2} @ ${current}: step gate 'review'\uFF08HITL \u95E8\uFF09\uFF0C\u505C\u7ED9\u4EBA\u590D\u6838\u2014\u2014--through-gates \u53EF\u663E\u5F0F\u653E\u884C`);
      return 0;
    }
    if (step.transitions.length > 1) {
      const events = step.transitions.map((t2) => t2.event).join(", ");
      deps.io.out(`[STOP] ${name2} @ ${current}: \u591A\u6761\u51FA\u8FB9\u9700\u4EBA\u9009 event\uFF08HITL\uFF09\uFF0C\u624B\u52A8 transition \u5176\u4E00\uFF1A${events}`);
      return 0;
    }
    if (steps >= maxSteps) {
      deps.io.out(`[STOP] ${name2} @ ${current}: \u8FBE\u5230 --max-steps=${maxSteps} \u4E0A\u9650\uFF0C\u505C\uFF08\u9632\u5931\u63A7\u4FDD\u9669\u4E1D\uFF09`);
      return 0;
    }
    const g = await guardQuietly(deps, name2);
    if (g.code !== 0) {
      deps.io.out(`[STOP] ${name2} @ ${current}: guard \u672A\u901A\u8FC7\uFF0C\u505C\uFF08\u4FEE\u590D\u540E\u91CD\u8BD5\uFF09`);
      for (const l of g.lines) if (l.includes("[FAIL]")) deps.io.out(`  ${l.trim()}`);
      return g.code === 2 ? 2 : 1;
    }
    const edge = step.transitions[0];
    const t = await transitionQuietly(deps, name2, edge.event);
    if (t.code !== 0) {
      deps.io.out(`[STOP] ${name2} @ ${current}: transition ${edge.event} \u5931\u8D25\uFF0C\u505C`);
      for (const l of t.lines) deps.io.out(`  ${l.trim()}`);
      return 1;
    }
    deps.io.out(`[ADVANCE] ${name2}: ${current} -> ${edge.to}\uFF08${edge.event}\uFF09`);
    current = edge.to;
    steps += 1;
  }
}
async function dryRunCustomPlan(deps, name2, wf, workflowName, start, through, maxSteps) {
  deps.io.out(`[DRY-RUN] ${name2}: \u8BA1\u5212\u9884\u89C8\uFF08\u4E0D\u6539\u76D8\uFF09\u4ECE ${start} \u8D77\uFF08max-steps=${maxSteps}${through ? "\uFF0Cthrough-gates" : ""}\uFF09`);
  const hard = await freshHardGate(deps);
  if (hard) {
    deps.io.out(`  \u9884\u8BA1\u505C\u5728 ${start}: \u786C\u95E8 .pipeline-pending-${hard} \u65B0\u9C9C\u5B58\u5728\uFF0C\u7EDD\u4E0D\u81EA\u52A8\u8DE8\u8D8A\uFF08HITL \u7EA2\u7EBF\uFF09`);
    return 0;
  }
  const startStep = resolveStep(wf, start);
  if (!startStep) {
    deps.io.err(`ERROR: step '${start}' \u4E0D\u5728 workflow '${workflowName}' \u91CC`);
    return 1;
  }
  if (startStep.gate === "confirm") {
    deps.io.out(`  \u9884\u8BA1\u505C\u5728 ${start}: step gate 'confirm'\uFF08human gate\uFF0C\u7EDD\u4E0D\u81EA\u52A8\u8DE8\u8D8A\uFF09`);
    return 0;
  }
  if (startStep.gate === "review" && !through) {
    deps.io.out(`  \u9884\u8BA1\u505C\u5728 ${start}: step gate 'review'\uFF08HITL \u95E8\uFF0C--through-gates \u653E\u884C\uFF09`);
    return 0;
  }
  if (startStep.transitions.length === 0) {
    deps.io.out(`  \u9884\u8BA1\u505C\u5728 ${start}: \u5DF2\u5230\u7EC8\u6001`);
    return 0;
  }
  if (startStep.transitions.length > 1) {
    deps.io.out(`  \u9884\u8BA1\u505C\u5728 ${start}: \u591A\u6761\u51FA\u8FB9\u9700\u4EBA\u9009 event\uFF08\u53EF\u9009: ${startStep.transitions.map((t) => t.event).join(", ")}\uFF09`);
    return 0;
  }
  const g = await guardQuietly(deps, name2);
  if (g.code !== 0) {
    deps.io.out(`  guard@${start} \u672A\u901A\u8FC7 \u2192 \u9884\u8BA1\u505C\u5728 ${start}\uFF08\u4E0D\u63A8\u8FDB\uFF09`);
    for (const l of g.lines) if (l.includes("[FAIL]")) deps.io.out(`  ${l.trim()}`);
    return 0;
  }
  deps.io.out(`  guard@${start}: \u901A\u8FC7`);
  let current = start;
  let steps = 0;
  const visited = /* @__PURE__ */ new Set();
  while (steps < maxSteps) {
    const step = resolveStep(wf, current);
    if (!step) {
      deps.io.err(`ERROR: step '${current}' \u4E0D\u5728 workflow '${workflowName}' \u91CC`);
      return 1;
    }
    if (step.transitions.length === 0) {
      deps.io.out(`  \u9884\u8BA1\u505C\u5728 ${current}: \u5DF2\u5230\u7EC8\u6001`);
      return 0;
    }
    if (step.transitions.length > 1) {
      deps.io.out(`  \u9884\u8BA1\u505C\u5728 ${current}: \u591A\u6761\u51FA\u8FB9\u9700\u4EBA\u9009 event\uFF08\u53EF\u9009: ${step.transitions.map((t) => t.event).join(", ")}\uFF09`);
      return 0;
    }
    const edge = step.transitions[0];
    deps.io.out(`  \u8BA1\u5212 ${steps + 1}: ${current} -> ${edge.to}\uFF08${edge.event}\uFF09${steps === 0 ? "" : "  [live-guard]"}`);
    visited.add(current);
    current = edge.to;
    steps += 1;
    const entered = resolveStep(wf, current);
    if (entered?.gate === "confirm") {
      deps.io.out(`  \u9884\u8BA1\u505C\u5728 ${current}: step gate 'confirm'\uFF08human gate\uFF0C\u7EDD\u4E0D\u81EA\u52A8\u8DE8\u8D8A\uFF09`);
      return 0;
    }
    if (entered?.gate === "review" && !through) {
      deps.io.out(`  \u9884\u8BA1\u505C\u5728 ${current}: step gate 'review'\uFF08HITL \u95E8\uFF0C--through-gates \u653E\u884C\uFF09`);
      return 0;
    }
    if (visited.has(current)) {
      deps.io.out(`  \u9884\u8BA1\u505C\u5728 ${current}: \u68C0\u6D4B\u5230\u73AF\uFF0C\u505C`);
      return 0;
    }
  }
  deps.io.out(`  \u9884\u8BA1\u5728 ${current} \u89E6\u53CA --max-steps=${maxSteps} \u4E0A\u9650`);
  return 0;
}

// packages/cli/src/commands/afk.ts
import { execFile as execFile3 } from "node:child_process";
import { writeFile as writeFile7 } from "node:fs/promises";
import { join as join30 } from "node:path";
import { promisify } from "node:util";
var AUTOMATION_STATES = ["off", "queued", "scheduled", "running", "merged", "failed", "conflict", "paused"];
var DEFAULT_SANDCASTLE_IMAGE = "sandcastle:local";
var execFileAsync = promisify(execFile3);
function isAutomationLevel(v) {
  return AUTOMATION_LEVELS.includes(v);
}
async function currentBranch(cwd) {
  try {
    const { stdout } = await execFileAsync("git", ["branch", "--show-current"], { cwd });
    return stdout.trim();
  } catch {
    return "";
  }
}
async function cmdAfk(deps, sub, name2, opts) {
  const level = opts.level && isAutomationLevel(opts.level) ? opts.level : "L1";
  if (opts.level && !isAutomationLevel(opts.level)) {
    deps.io.err(`ERROR: --level \u9700 L1|L2|L3\uFF0C\u6536\u5230 '${opts.level}'`);
    return 1;
  }
  const auto = createAutomation({ repoRoot: deps.cwd, store: deps.store, clock: deps.clock, config: { level } });
  switch (sub) {
    case "enqueue": {
      if (!name2 || !isValidChangeName(name2)) {
        deps.io.err(`ERROR: enqueue \u9700\u5408\u6CD5 change \u540D: '${name2 ?? ""}'`);
        return 1;
      }
      try {
        const queued = await auto.enqueue(name2);
        if (opts.json) deps.io.out(JSON.stringify({ change: name2, queued }));
        else deps.io.err(queued ? `[AFK] ${name2} \u5DF2\u6302\u961F\uFF08automation=queued\uFF0C\u9ED8\u8BA4 L1 report-only\uFF09` : `[AFK] ${name2} \u672A\u6302\u961F\uFF08\u975E spec-complete / PM \u8F68 / \u5DF2\u5728\u961F / \u672A opt-in\uFF09`);
        return queued ? 0 : 3;
      } catch (e) {
        deps.io.err(`ERROR: ${errMsg(e)}`);
        return 1;
      }
    }
    case "scan": {
      try {
        const ready = await auto.scanReady();
        if (opts.json) deps.io.out(JSON.stringify({ ready }));
        else if (ready.length === 0) deps.io.out("AFK \u5C31\u7EEA\u961F\u5217\u7A7A\u2014\u2014\u65E0 queued \u4E14\u4F9D\u8D56\u6EE1\u8DB3\u7684 change");
        else {
          deps.io.out(`AFK \u5C31\u7EEA\u961F\u5217\uFF08${ready.length}\uFF09:`);
          for (const n of ready) deps.io.out(`  - ${n}`);
        }
        return 0;
      } catch (e) {
        deps.io.err(`ERROR: ${errMsg(e)}`);
        return 1;
      }
    }
    case "status": {
      const root = changesRoot(deps.cwd);
      const lanes = Object.fromEntries(AUTOMATION_STATES.map((s) => [s, []]));
      let names;
      try {
        names = await deps.listChanges(root);
      } catch {
        names = [];
      }
      for (const n of name2 ? [name2] : names) {
        try {
          const fields = (await deps.store.read(changeDir(deps.cwd, n))).fields;
          const a = str(fields.automation) || "off";
          if (a in lanes) lanes[a].push(n);
        } catch {
        }
      }
      const active = Object.fromEntries(Object.entries(lanes).filter(([, v]) => v.length > 0));
      if (opts.json) {
        deps.io.out(JSON.stringify({ lanes: active }));
        return 0;
      }
      const entries = Object.entries(active);
      if (entries.length === 0) {
        deps.io.out("\u65E0 AFK \u6D3B\u8DC3 change\uFF08\u5168 off\uFF09");
        return 0;
      }
      deps.io.out("AFK \u6CF3\u9053:");
      for (const [s, ns] of entries) deps.io.out(`  ${s.padEnd(10)} ${ns.join(", ")}`);
      return 0;
    }
    case "run": {
      const ready = await auto.scanReady().catch(() => []);
      if (ready.length === 0) {
        deps.io.out("AFK run: \u5C31\u7EEA\u961F\u5217\u7A7A\u2014\u2014\u65E0 queued \u4E14\u4F9D\u8D56\u6EE1\u8DB3\u7684 change");
        return 0;
      }
      const hasDocker = await dockerAvailable((file, args) => nodeExec(file, args));
      if (!hasDocker) {
        deps.io.err(`[AFK] run \u9700 docker daemon\uFF08\u672A\u68C0\u6D4B\u5230\uFF09\u3002\u5C31\u7EEA\u961F\u5217 ${ready.length} \u9879\uFF1A${ready.join(", ")}\u3002\u5F53\u524D\u73AF\u5883\u4E0D\u6267\u884C\u5BB9\u5668\uFF08\u8BDA\u5B9E\u95E8\uFF1A\u4E0D\u4F2A\u88C5 docker \u5C31\u7EEA\uFF09\u3002`);
        return 0;
      }
      const base = await currentBranch(deps.cwd);
      if (!base) {
        deps.io.err("[AFK] run \u9700\u5728 git \u4ED3\u5E93\u5185\u3001\u975E detached HEAD\uFF08\u53D6\u4E0D\u5230\u5F53\u524D\u5206\u652F\u540D\uFF0C\u547D\u540D\u5206\u652F/merge-back \u65E0\u951A\u70B9\uFF09");
        return 1;
      }
      const image = opts.image ?? readAutomationJson(deps.cwd).image ?? DEFAULT_SANDCASTLE_IMAGE;
      const resolveDenylist = async (changeName) => denylistForChange(loadRegistry(deps.cwd).data?.loops ?? [], changeName);
      const resolveRunner = async (changeName) => runnerForChange(loadRegistry(deps.cwd).data?.loops ?? [], changeName);
      const secretsEnv = deps.readSecretsEnv ? await deps.readSecretsEnv().catch(() => ({})) : {};
      const hostEnv = { ...secretsEnv };
      for (const [k, v] of Object.entries(process.env)) {
        if (v !== void 0 && v !== "") hostEnv[k] = v;
      }
      const runChange = createDockerRunChange({ hostRepoDir: deps.cwd, base, level, image, store: deps.store, resolveDenylist, resolveRunner, hostEnv });
      await auto.runRound(runChange);
      deps.io.out(`AFK run: \u8DD1\u5B8C\u4E00\u8F6E\uFF08${ready.length} \u9879\u5019\u9009\uFF0Clevel=${level}\uFF0Cimage=${image}\uFF09`);
      return 0;
    }
    case "cancel": {
      if (!name2 || !isValidChangeName(name2)) {
        deps.io.err(`ERROR: cancel \u9700\u5408\u6CD5 change \u540D: '${name2 ?? ""}'`);
        return 1;
      }
      const dir = changeDir(deps.cwd, name2);
      let automation;
      let worktree;
      let sandbox;
      try {
        automation = str(await deps.store.get(dir, "automation"));
        worktree = str(await deps.store.get(dir, "automation_worktree"));
        sandbox = str(await deps.store.get(dir, "automation_sandbox"));
      } catch (e) {
        deps.io.err(`ERROR: \u627E\u4E0D\u5230 change '${name2}'\uFF08\u65E0 .pipeline.yaml\uFF1F\uFF09\uFF1A${errMsg(e)}`);
        return 1;
      }
      if (automation !== "running") {
        deps.io.err(`[AFK] ${name2} automation='${automation || "(\u7A7A)"}'\uFF0C\u4E0D\u662F running\u2014\u2014\u627E\u4E0D\u5230\u8FD0\u884C\u4E2D\u7684 job\uFF0C\u672A\u505A\u4EFB\u4F55\u53D6\u6D88\u52A8\u4F5C`);
        return 3;
      }
      if (!worktree || !sandbox) {
        deps.io.err(`[AFK] ${name2} \u7F3A automation_worktree/automation_sandbox\uFF0C\u65E0\u6CD5\u5B9A\u4F4D\u6C99\u7BB1\u5BB9\u5668\uFF08\u5B57\u6BB5\u53EF\u80FD\u88AB\u65E7\u7248\u622A\u65AD\u635F\u574F\uFF09\uFF0C\u672A\u505A\u4EFB\u4F55\u53D6\u6D88\u52A8\u4F5C`);
        return 1;
      }
      try {
        await writeFile7(join30(worktree, CANCEL_MARKER_FILE), "1", "utf8");
      } catch (e) {
        const code = e?.code ?? "unknown";
        deps.io.err(`[AFK] ${name2} \u65E0\u6CD5\u5728 automation_worktree \u843D\u53D6\u6D88\u6807\u8BB0\uFF08${code}\uFF09\uFF1Aworktree \u76EE\u5F55\u53EF\u80FD\u5DF2\u88AB\u6E05\u7406/\u5B57\u6BB5\u635F\u574F\u2014\u2014\u4EFB\u52A1\u82E5\u5DF2\u4E0D\u5728\u8DD1\uFF0C\u53EF\u76F4\u63A5 enqueue \u91CD\u8BD5\u6216\u5FFD\u7565`);
        return 1;
      }
      const hasDocker = await dockerAvailable((file, args) => nodeExec(file, args));
      if (!hasDocker) {
        deps.io.err(`[AFK] ${name2} \u53D6\u6D88\u6807\u8BB0\u5DF2\u843D\uFF0C\u4F46\u672A\u68C0\u6D4B\u5230 docker daemon\u2014\u2014\u65E0\u6CD5 kill \u6C99\u7BB1\u5BB9\u5668 '${sandbox}'\uFF08\u8BDA\u5B9E\u95E8\uFF1A\u4E0D\u4F2A\u88C5\u5DF2 kill\uFF09\u3002\u5BB9\u5668\u82E5\u4ECD\u5728\u8DD1\uFF0C\u4F1A\u5728\u5176\u7ED3\u7B97\u65F6\u8BFB\u5230\u6807\u8BB0\u5E76\u8F6C CancelledRunError\u3002`);
        if (opts.json) deps.io.out(JSON.stringify({ change: name2, cancelled: true, killed: false, reason: "docker-unavailable" }));
        return 0;
      }
      await nodeExec("docker", ["kill", sandbox]);
      if (opts.json) deps.io.out(JSON.stringify({ change: name2, cancelled: true, killed: true }));
      else deps.io.err(`[AFK] ${name2} \u5DF2\u53D6\u6D88\uFF1A\u53D6\u6D88\u6807\u8BB0\u5DF2\u843D + docker kill ${sandbox}`);
      return 0;
    }
    default:
      deps.io.err(`ERROR: \u672A\u77E5 afk \u5B50\u547D\u4EE4: ${sub}\uFF08\u652F\u6301: enqueue <name> / scan / status [name] / run [--level] [--image] / cancel <name>\uFF09`);
      return 1;
  }
}

// packages/cli/src/commands/channel.ts
import { rmSync as rmSync3 } from "node:fs";
import { homedir as homedir6 } from "node:os";
function nodeChannelHost(cwd, clock) {
  const root = resolveRoot(homedir6(), process.env.TRELLIS_CHANNEL_ROOT);
  const override = process.env.PIPELINE_CHANNEL_PROJECT;
  const env = { root, cwd, ...override ? { projectOverride: override } : {} };
  return { store: createChannelStore(env, void 0, clock), env };
}
function hostFs(host) {
  return host.fs ?? nodeChannelFs();
}
function hostProc(host) {
  return host.proc ?? nodeProcessFace();
}
function hostNow(host) {
  return host.now ?? (() => Date.now());
}
function realSleep(ms) {
  return new Promise((r) => {
    const t = setTimeout(r, ms);
    if (typeof t.unref === "function") t.unref();
  });
}
function hostSleep(host) {
  return host.sleep ?? realSleep;
}
function hostEnvVar(host) {
  return host.envVar ?? ((n) => process.env[n]);
}
function hostRmrf(host) {
  return host.rmrf ?? ((path6) => {
    if (!path6.startsWith(host.env.root)) return;
    try {
      rmSync3(path6, { recursive: true, force: true });
    } catch {
    }
  });
}
function defaultLauncher(host) {
  return (channel, worker, config, scope) => {
    const fs = hostFs(host);
    const proc = hostProc(host);
    const cfgPath = workerFile(host.env, channel, worker, "config", scope);
    fs.writeText(cfgPath, JSON.stringify(config));
    const entry = process.argv[1] ?? "";
    const childEnv = {
      TRELLIS_CHANNEL_ROOT: host.env.root,
      PIPELINE_CHANNEL_PROJECT: projectKey(host.env)
    };
    const pid = proc.spawnDetached(process.execPath, [entry, "channel", "__supervisor", channel, worker, cfgPath], {
      env: childEnv
    });
    return { pid };
  };
}
var KILL_GRACE_MS = 8e3;
var CLEANUP_SUFFIXES2 = ["pid", "worker-pid", "config", "spawnlock", "reservation", "shutdown-reason"];
function intFlag(flags, key) {
  const v = strFlag(flags, key);
  if (v === void 0) return void 0;
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) ? n : void 0;
}
function intOrUndef(v) {
  if (v === void 0) return void 0;
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) ? n : void 0;
}
function resolvePolicy(host, flags) {
  const envVar = hostEnvVar(host);
  const max = intFlag(flags, "max-live-workers") ?? intOrUndef(envVar("TRELLIS_CHANNEL_MAX_LIVE_WORKERS")) ?? 0;
  const idle = intFlag(flags, "idle-timeout") ?? intOrUndef(envVar("TRELLIS_CHANNEL_WORKER_IDLE_TIMEOUT")) ?? 0;
  return { idleTimeoutMs: idle, maxLiveWorkers: max };
}
function parseDurationS(s, fallback) {
  const m = /^(\d+)(ms|s|m|h|d)?$/.exec((s ?? "").trim());
  if (!m) return fallback;
  const n = Number.parseInt(m[1], 10);
  const unit = m[2] ?? "s";
  const mul = { ms: 1e-3, s: 1, m: 60, h: 3600, d: 86400 };
  return n * mul[unit];
}
var TIMEOUT_EXIT = 124;
var USAGE_EXIT = 2;
var ChannelDie = class extends Error {
  constructor(msg, code = USAGE_EXIT) {
    super(msg);
    this.code = code;
  }
  code;
};
function die(msg, code = USAGE_EXIT) {
  throw new ChannelDie(msg, code);
}
function strFlag(flags, key) {
  const v = flags[key];
  return typeof v === "string" ? v : void 0;
}
function numberFlag(flags, key) {
  const v = flags[key];
  if (v === void 0) return void 0;
  if (typeof v !== "string") die(`[channel] --${key} \u9700\u6570\u503C`);
  const n = Number(v);
  if (!Number.isFinite(n)) die(`[channel] --${key} \u975E\u6CD5\u6570\u503C: ${v}`);
  return n;
}
function scopeOf(flags) {
  return strFlag(flags, "scope") === "global" ? "global" : "project";
}
function csv(v) {
  if (!v) return [];
  return v.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
}
function emit(deps, ev) {
  deps.io.out(JSON.stringify(ev));
}
function cmdCreate(deps, host, p) {
  const name2 = p.positional[0];
  if (!name2) die("[channel create] \u7F3A channel \u540D");
  const scope = scopeOf(p.flags);
  const type = strFlag(p.flags, "type") ?? "chat";
  const ev = host.store.append(
    name2,
    {
      kind: "create",
      by: "main",
      origin: "cli",
      action: "create",
      task: strFlag(p.flags, "task") ?? "",
      type,
      ...p.flags.ephemeral === true ? { ephemeral: true } : {},
      ...strFlag(p.flags, "description") ? { message: strFlag(p.flags, "description") } : {}
    },
    scope
  );
  emit(deps, ev);
  return 0;
}
function cmdTitle(deps, host, p) {
  const name2 = p.positional[0];
  if (!name2) die("[channel title] \u7F3A channel \u540D");
  const scope = scopeOf(p.flags);
  if (typeof p.flags.set === "string") {
    emit(deps, host.store.append(name2, { kind: "channel", by: "main", origin: "cli", action: "title", title: p.flags.set }, scope));
    return 0;
  }
  if (p.flags.clear === true) {
    emit(deps, host.store.append(name2, { kind: "channel", by: "main", origin: "cli", action: "title", title: null }, scope));
    return 0;
  }
  die("[channel title] \u9700 --set <title> \u6216 --clear");
}
function cmdContext(deps, host, p) {
  const name2 = p.positional[0];
  if (!name2) die("[channel context] \u7F3A channel \u540D");
  const scope = scopeOf(p.flags);
  const action = p.flags.add === true ? "add" : p.flags.delete === true ? "delete" : void 0;
  if (!action) die("[channel context] \u9700 --add \u6216 --delete");
  const file = strFlag(p.flags, "file");
  const raw = strFlag(p.flags, "raw");
  if (file) {
    if (!file.startsWith("/")) die(`[channel context] --file \u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84: ${file}`);
  } else if (!raw) {
    die("[channel context] \u9700 --file <\u7EDD\u5BF9\u8DEF\u5F84> \u6216 --raw <\u975E\u7A7A\u6587\u672C>");
  }
  const thread = strFlag(p.flags, "thread");
  const ctx = [];
  if (file) ctx.push({ file });
  if (raw) ctx.push({ raw });
  emit(
    deps,
    host.store.append(
      name2,
      { kind: "context", by: "main", origin: "cli", action, target: thread ? "thread" : "channel", context: ctx, ...thread ? { thread } : {} },
      scope
    )
  );
  return 0;
}
function cmdSend(deps, host, p) {
  const name2 = p.positional[0];
  if (!name2) die("[channel send] \u7F3A channel \u540D");
  const by = strFlag(p.flags, "as");
  if (!by) die("[channel send] \u9700 --as <by>");
  const text = p.positional[1] ?? "";
  if (!text) die("[channel send] \u7A7A\u6587\u672C\uFF08\u9700 arg / --to \u5B9A\u5411\u6587\u672C\uFF09");
  const scope = scopeOf(p.flags);
  const targets2 = csv(strFlag(p.flags, "to"));
  const mode = strFlag(p.flags, "delivery-mode") ?? "appendOnly";
  const partial = { kind: "message", by, origin: "cli", text };
  if (targets2.length === 1) partial.to = targets2[0];
  else if (targets2.length > 1) partial.to = targets2;
  const msg = host.store.append(name2, partial, scope);
  emit(deps, msg);
  if (mode !== "appendOnly" && targets2.length > 0) {
    const reg = host.store.registry(name2, scope).workers;
    for (const [target, reason] of classifyDelivery(targets2, reg, mode)) {
      emit(
        deps,
        host.store.append(
          name2,
          { kind: "undeliverable", by: "cli:send", origin: "cli", targetWorker: target, messageSeq: msg.seq, reason },
          scope
        )
      );
    }
  }
  return 0;
}
function buildWaitFilter(self, p) {
  const from = csv(strFlag(p.flags, "from"));
  const opts = {};
  if (self) opts.selfId = self;
  const kind = strFlag(p.flags, "kind");
  if (kind) opts.wantKind = kind;
  if (p.flags["include-progress"] === true) opts.includeProgress = true;
  if (from.length > 0) opts.fromBy = from;
  const to = strFlag(p.flags, "to") ?? self;
  if (to) opts.toFilter = to;
  return opts;
}
function cmdWait(deps, host, p) {
  const name2 = p.positional[0];
  if (!name2) die("[channel wait] \u7F3A channel \u540D");
  const self = strFlag(p.flags, "as");
  if (!self) die("[channel wait] \u9700 --as <self>");
  const scope = scopeOf(p.flags);
  const all = p.flags.all === true;
  const from = csv(strFlag(p.flags, "from"));
  if (all && from.length === 0) die("[channel wait] --all \u5FC5\u987B\u914D --from");
  const since = numberFlag(p.flags, "since");
  const filter = buildWaitFilter(self, p);
  const pending = all ? new Set(from) : null;
  for (const ev of host.store.read(name2, scope)) {
    if (since !== void 0 && typeof ev.seq === "number" && ev.seq <= since) continue;
    if (!matchesEventFilter(ev, filter)) continue;
    if (pending !== null) {
      pending.delete(typeof ev.by === "string" ? ev.by : "");
      emit(deps, ev);
      if (pending.size === 0) return 0;
    } else {
      emit(deps, ev);
      return 0;
    }
  }
  if (pending && pending.size > 0) deps.io.err(`timeout: still waiting on ${[...pending].sort().join(", ")}`);
  else deps.io.err("timeout: no matching event");
  return TIMEOUT_EXIT;
}
function cmdMessages(deps, host, p) {
  const name2 = p.positional[0];
  if (!name2) die("[channel messages] \u7F3A channel \u540D");
  const scope = scopeOf(p.flags);
  const since = numberFlag(p.flags, "since");
  const from = csv(strFlag(p.flags, "from"));
  const opts = {};
  const kind = strFlag(p.flags, "kind");
  if (kind) opts.wantKind = kind;
  if (p.flags["include-progress"] === true) opts.includeProgress = true;
  if (from.length > 0) opts.fromBy = from;
  const to = strFlag(p.flags, "to");
  if (to) opts.toFilter = to;
  let snap = host.store.read(name2, scope).filter((ev) => {
    if (since !== void 0 && typeof ev.seq === "number" && ev.seq <= since) return false;
    return matchesEventFilter(ev, opts);
  });
  const last = numberFlag(p.flags, "last");
  if (last !== void 0) {
    if (!Number.isInteger(last) || last <= 0) die(`[channel] --last \u9700\u6B63\u6574\u6570: ${strFlag(p.flags, "last")}`);
    snap = snap.slice(-last);
  }
  for (const ev of snap) emit(deps, ev);
  return 0;
}
function cmdRegistry(deps, host, p) {
  const name2 = p.positional[0];
  if (!name2) die("[channel registry] \u7F3A channel \u540D");
  emit(deps, host.store.registry(name2, scopeOf(p.flags)));
  return 0;
}
function cmdInterrupt(deps, host, p) {
  const name2 = p.positional[0];
  if (!name2) die("[channel interrupt] \u7F3A channel \u540D");
  const by = strFlag(p.flags, "as");
  if (!by) die("[channel interrupt] \u9700 --as <by>");
  const to = strFlag(p.flags, "to");
  if (!to) die("[channel interrupt] \u9700 --to <worker>");
  const text = p.positional[1] ?? "";
  if (!text) die("[channel interrupt] \u7A7A\u6587\u672C\uFF08\u9700 arg\uFF09");
  emit(
    deps,
    host.store.append(
      name2,
      { kind: "interrupt_requested", by, origin: "cli", worker: to, message: text, reason: "user" },
      scopeOf(p.flags)
    )
  );
  return 0;
}
var POST_ACTIONS = /* @__PURE__ */ new Set(["opened", "comment", "status", "labels", "assignees", "summary", "processed"]);
function channelType(events) {
  for (const e of events) {
    if (e.kind === "create") return typeof e.type === "string" && e.type || "chat";
  }
  return "chat";
}
function cmdThread(deps, host, p) {
  const op = p.positional[0];
  const name2 = p.positional[1];
  if (!op || !name2) die("[channel thread] \u7528\u6CD5: thread post|rename <name> ...");
  const by = strFlag(p.flags, "as");
  if (!by) die("[channel thread] \u9700 --as <by>");
  const scope = scopeOf(p.flags);
  const events = host.store.read(name2, scope);
  if (channelType(events) !== "forum") {
    die(`[channel thread] ${name2} \u4E0D\u662F forum channel\uFF08thread \u64CD\u4F5C\u9700 --type forum\uFF09`);
  }
  if (op === "rename") {
    const oldKey = normalizeThreadKey(strFlag(p.flags, "thread") ?? "");
    const newKey = normalizeThreadKey(strFlag(p.flags, "new-thread") ?? "");
    const existing = new Set(reduceThreads(events).map((s) => s.thread));
    if (existing.has(newKey) && newKey !== oldKey) {
      die(`[channel thread rename] \u76EE\u6807 key '${newKey}' \u5DF2\u5B58\u5728\uFF0C\u62D2\u7EDD silently merge`);
    }
    emit(deps, host.store.append(name2, { kind: "thread", by, origin: "cli", action: "rename", thread: oldKey, newThread: newKey }, scope));
    return 0;
  }
  if (op !== "post") die(`[channel thread] \u672A\u77E5\u5B50\u64CD\u4F5C '${op}'\uFF08post|rename\uFF09`);
  const action = strFlag(p.flags, "action");
  if (!action || !POST_ACTIONS.has(action)) {
    if (action === "rename") die("[channel thread] rename \u8D70\u4E13\u95E8\u5B50\u547D\u4EE4: thread rename <name> --thread X --new-thread Y");
    die(`[channel thread] \u975E\u6CD5 action '${action ?? ""}'\uFF08\u5408\u6CD5: ${[...POST_ACTIONS].join(", ")}\uFF09`);
  }
  const threadRaw = strFlag(p.flags, "thread") ?? "";
  let key;
  if (action === "opened") {
    key = threadRaw.trim() ? normalizeThreadKey(threadRaw) : `thread-${Math.floor(Date.now() / 1e3).toString(16)}`;
  } else {
    if (!threadRaw.trim()) die(`[channel thread] action=${action} \u9700 --thread`);
    key = normalizeThreadKey(threadRaw);
  }
  const partial = { kind: "thread", by, origin: "cli", action, thread: key };
  const title = strFlag(p.flags, "title");
  const description = strFlag(p.flags, "description");
  const status = strFlag(p.flags, "status");
  const summary = strFlag(p.flags, "summary");
  const labels = strFlag(p.flags, "labels");
  const assignees = strFlag(p.flags, "assignees");
  if (title) partial.title = title;
  if (description) partial.description = description;
  if (status) partial.status = status;
  if (summary) partial.summary = summary;
  if (labels) partial.labels = csv(labels);
  if (assignees) partial.assignees = csv(assignees);
  emit(deps, host.store.append(name2, partial, scope));
  return 0;
}
function cmdForum(deps, host, p) {
  const op = p.positional[0];
  if (op !== "list") die("[channel forum] \u7528\u6CD5: forum list <name>");
  const name2 = p.positional[1];
  if (!name2) die("[channel forum list] \u7F3A channel \u540D");
  const scope = scopeOf(p.flags);
  const states = reduceThreads(host.store.read(name2, scope));
  if (p.flags.json === true) deps.io.out(JSON.stringify(states));
  else deps.io.out(formatThreadBoard(states));
  return 0;
}
function cmdList(deps, host, p) {
  const rows = host.store.list({
    scope: scopeOf(p.flags),
    all: p.flags.all === true,
    allProjects: p.flags["all-projects"] === true
  });
  if (p.flags.json === true) {
    deps.io.out(JSON.stringify({ channels: rows }));
    return 0;
  }
  if (rows.length === 0) {
    deps.io.out("(no channels)");
    return 0;
  }
  const showProject = p.flags["all-projects"] === true;
  for (const c of rows) {
    const prefix = showProject ? `${c.project}/` : "";
    deps.io.out(
      `${(prefix + c.name).padEnd(24)} [${c.type}] events=${c.events} workers=${c.workersAlive}/${c.workersTotal}  ${typeof c.task === "string" ? c.task : ""}`.trimEnd()
    );
  }
  return 0;
}
function cmdDir(deps, host, p) {
  const name2 = p.positional[0];
  if (!name2) die("[channel dir] \u7F3A channel \u540D");
  deps.io.out(host.store.channelDir(name2, scopeOf(p.flags)));
  return 0;
}
function buildConfig(host, deps, flags, policy) {
  const cfgFile = strFlag(flags, "config");
  if (cfgFile) {
    const raw = hostFs(host).readText(cfgFile);
    if (raw === void 0) die(`[channel] --config \u8BFB\u4E0D\u5230: ${cfgFile}`);
    const parsed = JSON.parse(raw);
    if (parsed.idleTimeoutMs === void 0 && policy.idleTimeoutMs > 0) parsed.idleTimeoutMs = policy.idleTimeoutMs;
    return parsed;
  }
  const provider = strFlag(flags, "provider");
  if (!provider) die("[channel] \u9700 --config <path> \u6216 --provider <name>");
  const config = { provider, cwd: strFlag(flags, "cwd") ?? deps.cwd };
  if (policy.idleTimeoutMs > 0) config.idleTimeoutMs = policy.idleTimeoutMs;
  const to = intFlag(flags, "timeout-ms");
  if (to !== void 0) config.timeoutMs = to;
  const ip = strFlag(flags, "inbox-policy");
  if (ip === "broadcastAndExplicit" || ip === "explicitOnly") config.inboxPolicy = ip;
  return config;
}
async function cmdSpawn(deps, host, p) {
  const name2 = p.positional[0];
  if (!name2) die("[channel spawn] \u7F3A channel \u540D");
  const worker = strFlag(p.flags, "as");
  if (!worker) die("[channel spawn] \u9700 --as <worker>");
  const scope = scopeOf(p.flags);
  const fs = hostFs(host);
  const proc = hostProc(host);
  const policy = resolvePolicy(host, p.flags);
  const livenessDeps = { env: host.env, fs, proc };
  const enforce = enforceSpawnBudget(livenessDeps, policy, hostNow(host)(), scope);
  if (!enforce.allowed) {
    deps.io.err(formatBudgetOverflowError(projectKey(host.env), toOverflowFacts(enforce.remaining), policy.maxLiveWorkers));
    return USAGE_EXIT;
  }
  const config = buildConfig(host, deps, p.flags, policy);
  host.store.ensureDir(name2, scope);
  fs.writeText(workerFile(host.env, name2, worker, "reservation", scope), worker + "\n");
  const launcher = host.launchSupervisor ?? defaultLauncher(host);
  const launched = await launcher(name2, worker, config, scope);
  if (launched.pid === void 0) {
    fs.remove(workerFile(host.env, name2, worker, "reservation", scope));
    deps.io.err("[channel spawn] supervisor fork \u5931\u8D25");
    return 1;
  }
  deps.io.out(String(launched.pid));
  return 0;
}
function killCleanup(host, name2, worker, scope) {
  const fs = hostFs(host);
  for (const s of CLEANUP_SUFFIXES2) fs.remove(workerFile(host.env, name2, worker, s, scope));
}
async function cmdKill(deps, host, p) {
  const name2 = p.positional[0];
  if (!name2) die("[channel kill] \u7F3A channel \u540D");
  const worker = strFlag(p.flags, "as");
  if (!worker) die("[channel kill] \u9700 --as <worker>");
  const scope = scopeOf(p.flags);
  const force = p.flags.force === true;
  const fs = hostFs(host);
  const proc = hostProc(host);
  const now = hostNow(host);
  const sleep3 = hostSleep(host);
  const graceMs = host.killGraceMs ?? KILL_GRACE_MS;
  const readPid2 = (suffix) => {
    const raw = fs.readText(workerFile(host.env, name2, worker, suffix, scope));
    if (raw === void 0) return void 0;
    const n = Number.parseInt(raw.trim(), 10);
    return Number.isInteger(n) ? n : void 0;
  };
  const supPid = readPid2("pid");
  const workerPid = readPid2("worker-pid");
  if (supPid === void 0) {
    deps.io.err("[channel kill] \u65E0 pid \u6587\u4EF6\uFF08worker \u672A\u8FD0\u884C\uFF1F\uFF09");
    killCleanup(host, name2, worker, scope);
    return USAGE_EXIT;
  }
  if (!proc.pidAlive(supPid)) {
    host.store.append(name2, { kind: "error", by: "cli:kill", worker, message: "supervisor lost" }, scope);
    killCleanup(host, name2, worker, scope);
    return 0;
  }
  if (force) {
    if (workerPid !== void 0 && proc.pidAlive(workerPid)) proc.kill(workerPid, "SIGKILL");
    proc.kill(supPid, "SIGKILL");
    host.store.append(name2, { kind: "killed", by: "cli:kill", worker, reason: "explicit-kill", signal: "SIGKILL" }, scope);
    killCleanup(host, name2, worker, scope);
    return 0;
  }
  proc.kill(supPid, "SIGTERM");
  const deadline = now() + graceMs;
  while (now() < deadline && proc.pidAlive(supPid)) await sleep3(100);
  if (proc.pidAlive(supPid)) {
    if (workerPid !== void 0 && proc.pidAlive(workerPid)) proc.kill(workerPid, "SIGKILL");
    proc.kill(supPid, "SIGKILL");
    host.store.append(
      name2,
      { kind: "killed", by: "cli:kill", worker, reason: "explicit-kill", signal: "SIGKILL", detail: "grace expired, supervisor SIGKILL by CLI" },
      scope
    );
  }
  killCleanup(host, name2, worker, scope);
  return 0;
}
var PRUNE_SELECTORS = ["ephemeral", "all", "empty", "idle"];
function cmdPrune(deps, host, p) {
  const chosen = PRUNE_SELECTORS.filter((s) => p.flags[s] === true || s === "idle" && typeof p.flags.idle === "string");
  if (chosen.length === 0) die("[channel prune] \u9700\u56DB selector \u4E4B\u4E00\uFF1A--ephemeral|--all|--empty|--idle DUR");
  if (chosen.length > 1) die("[channel prune] selector \u4E92\u65A5\uFF08--ephemeral/--all/--empty/--idle \u4EC5\u7ED9\u4E00\u4E2A\uFF09");
  const sel = chosen[0];
  const idleS = parseDurationS(strFlag(p.flags, "idle"), 0);
  const dry = p.flags["dry-run"] === true;
  const yes = p.flags.yes === true;
  const keep = new Set(csv(strFlag(p.flags, "keep")));
  const scope = strFlag(p.flags, "scope") === "global" ? "global" : "project";
  const fs = hostFs(host);
  const proc = hostProc(host);
  const rmrf = hostRmrf(host);
  const now = hostNow(host);
  const bucket = bucketDir(host.env, scope);
  const candidates = [];
  for (const e of fs.listDir(bucket)) {
    if (!e.isDirectory || e.name.startsWith(".")) continue;
    if (keep.has(e.name)) continue;
    const dir = `${bucket}/${e.name}`;
    if (hasLiveWorker(fs, proc, dir)) continue;
    const evs = parseEventsText(fs.readText(`${dir}/events.jsonl`));
    const first = evs[0];
    const last = evs[evs.length - 1];
    let match = false;
    if (sel === "all") match = true;
    else if (sel === "ephemeral") match = Boolean(first && first.ephemeral);
    else if (sel === "empty") match = evs.length <= 1;
    else if (sel === "idle") {
      const ts = typeof last?.ts === "string" ? last.ts : "";
      const t = Date.parse(ts);
      match = !Number.isNaN(t) && (now() - t) / 1e3 >= idleS;
    }
    if (match) candidates.push({ name: e.name, dir });
  }
  if (dry) {
    for (const c of candidates) deps.io.out(`would remove: ${c.name}`);
    deps.io.out(`would remove ${candidates.length} channel(s)`);
    return 0;
  }
  if (!yes) {
    deps.io.err(`Refusing to delete ${candidates.length} channel(s) without --yes`);
    return USAGE_EXIT;
  }
  for (const c of candidates) rmrf(c.dir);
  deps.io.out(`removed ${candidates.length} channel(s)`);
  return 0;
}
async function pollForEvent(host, name2, scope, predicate, timeoutMs) {
  const sleep3 = hostSleep(host);
  const now = hostNow(host);
  const deadline = now() + timeoutMs;
  for (; ; ) {
    for (const ev of host.store.read(name2, scope)) {
      if (predicate(ev)) return ev;
    }
    if (now() >= deadline) return void 0;
    await sleep3(25);
  }
}
async function cmdRun(deps, host, p) {
  const by = strFlag(p.flags, "as");
  if (!by) die("[channel run] \u9700 --as <by>");
  if (!strFlag(p.flags, "provider") && !strFlag(p.flags, "config")) die("[channel run] \u9700 --provider <name> \u6216 --config <path>");
  const message = strFlag(p.flags, "message");
  if (!message) die("[channel run] \u9700 --message <text>");
  const scope = scopeOf(p.flags);
  const worker = "runner";
  const name2 = strFlag(p.flags, "name") ?? `run-${Math.floor(Math.random() * 4294967295).toString(16)}`;
  const timeoutMs = Math.round(parseDurationS(strFlag(p.flags, "timeout"), 300) * 1e3);
  const policy = resolvePolicy(host, p.flags);
  const rmrf = hostRmrf(host);
  host.store.append(name2, { kind: "create", by: "main", action: "create", task: "run", type: "chat", ephemeral: true }, scope);
  const config = buildConfig(host, deps, p.flags, policy);
  const launcher = host.launchSupervisor ?? defaultLauncher(host);
  const launched = await launcher(name2, worker, config, scope);
  await pollForEvent(host, name2, scope, (ev) => ev.kind === "spawned" || ev.kind === "error" && typeof ev.by === "string" && ev.by.startsWith("supervisor:"), 1e4);
  host.store.append(name2, { kind: "message", by, to: worker, text: message }, scope);
  const outcome = await pollForEvent(host, name2, scope, (ev) => ev.by === worker && (ev.kind === "done" || ev.kind === "error" || ev.kind === "killed"), timeoutMs);
  if (launched.shutdown) {
    await launched.shutdown("SIGTERM", "explicit-kill");
    if (launched.done) await launched.done;
  } else if (launched.pid !== void 0) {
    hostProc(host).kill(launched.pid, "SIGTERM");
  }
  if (outcome && outcome.kind === "done") {
    const msgs = host.store.read(name2, scope).filter((e) => (e.kind === "message" || e.kind === "done") && e.by === worker && typeof e.text === "string" && e.text);
    if (msgs.length > 0) deps.io.out(String(msgs[msgs.length - 1].text));
    rmrf(host.store.channelDir(name2, scope));
    return 0;
  }
  deps.io.err(`[channel run] worker \u672A\u6210\u529F\u5B8C\u6210\uFF1Bchannel kept for inspection: ${host.store.channelDir(name2, scope)}`);
  return 1;
}
async function cmdSupervisor(deps, host, p) {
  const [channel, worker, cfgPath] = p.positional;
  if (!channel || !worker || !cfgPath) {
    deps.io.err("usage: channel __supervisor <channel> <worker> <config-path>");
    return USAGE_EXIT;
  }
  const fs = hostFs(host);
  const raw = fs.readText(cfgPath);
  const config = raw ? JSON.parse(raw) : { provider: "echo" };
  const scope = scopeOf(p.flags);
  const handle = await startSupervisor(channel, worker, config, {
    store: host.store,
    proc: hostProc(host),
    fs,
    env: host.env,
    resolveAdapter: echoOnlyAdapters,
    scope
  });
  const onSig = (signalName) => {
    void handle.shutdown(signalName, "explicit-kill");
  };
  process.on("SIGTERM", () => onSig("SIGTERM"));
  process.on("SIGINT", () => onSig("SIGINT"));
  process.on("SIGHUP", () => onSig("SIGHUP"));
  await handle.done;
  return 0;
}
var USAGE = `pipeline channel \u2014 event-sourced worker \u603B\u7EBF\uFF08\u6B63\u4EA4\u6301\u4E45\u5C42\uFF0C\u7EDD\u4E0D\u89E6 barrier/\u4E09\u95E8/build_sha\uFF09

\u7ED3\u6784:
  create  <name> --task T [--type chat|forum] [--scope project|global] [--description D]
  title   <name> (--set <title> | --clear) [--scope ...]
  context <name> --add|--delete (--file <ABS> | --raw <text>) [--thread K] [--scope ...]
  dir     <name> [--scope project|global]
\u6D88\u606F/\u4E2D\u65AD:
  send      <name> <text> --as <by> [--to CSV] [--delivery-mode appendOnly|requireKnownWorker|requireRunningWorker]
  wait      <name> --as <self> [--from CSV] [--kind K] [--to T] [--since SEQ] [--all]   # \u65E0\u5339\u914D exit 124
  messages  <name> [--last N] [--since SEQ] [--kind K] [--from CSV] [--to T]
  interrupt <name> --as <by> --to <worker> <text>                                       # \u53EA\u5199\u4E8B\u4EF6
  registry  <name>                                                                       # worker \u6CE8\u518C\u8868\u6295\u5F71
forum:
  thread post   <name> --as <by> --action opened|comment|status|labels|assignees|summary|processed [--thread K]
  thread rename <name> --as <by> --thread OLD --new-thread NEW
  forum list    <name> [--json]
  list          [--json] [--all] [--all-projects]
\u8FDB\u7A0B\u5C42\uFF08\u771F fork / OS \u4FE1\u53F7 / liveness\uFF0C\u6B63\u4EA4\u6301\u4E45 worker \u5C42\uFF09\uFF1A
  spawn <name> --as <worker> (--provider echo | --config <path>) [--max-live-workers N] [--idle-timeout MS]
  kill  <name> --as <worker> [--force] [--scope]                                # SIGTERM supervisor + grace
  run   [--name N] --as <by> (--provider echo | --config <path>) --message M [--timeout D]   # ephemeral \u7AEF\u5230\u7AEF
  prune (--ephemeral|--all|--empty|--idle DUR) [--dry-run] [--yes] [--keep CSV] [--scope]    # \u8DF3 hasLiveWorker`;
async function cmdChannel(deps, sub, args, host = nodeChannelHost(deps.cwd)) {
  if (sub === "" || sub === "help" || sub === "--help" || sub === "-h") {
    deps.io.out(USAGE);
    return 0;
  }
  const p = splitFlags(args);
  try {
    switch (sub) {
      case "create":
        return cmdCreate(deps, host, p);
      case "title":
        return cmdTitle(deps, host, p);
      case "context":
        return cmdContext(deps, host, p);
      case "send":
        return cmdSend(deps, host, p);
      case "wait":
        return cmdWait(deps, host, p);
      case "messages":
        return cmdMessages(deps, host, p);
      case "registry":
        return cmdRegistry(deps, host, p);
      case "interrupt":
        return cmdInterrupt(deps, host, p);
      case "thread":
        return cmdThread(deps, host, p);
      case "forum":
        return cmdForum(deps, host, p);
      case "list":
        return cmdList(deps, host, p);
      case "dir":
        return cmdDir(deps, host, p);
      case "spawn":
        return await cmdSpawn(deps, host, p);
      case "kill":
        return await cmdKill(deps, host, p);
      case "run":
        return await cmdRun(deps, host, p);
      case "prune":
        return cmdPrune(deps, host, p);
      case "__supervisor":
        return await cmdSupervisor(deps, host, p);
      default:
        deps.io.err(`[channel] \u672A\u77E5\u5B50\u547D\u4EE4: ${sub}`);
        return USAGE_EXIT;
    }
  } catch (e) {
    if (e instanceof ChannelDie) {
      deps.io.err(e.message);
      return e.code;
    }
    if (e instanceof Error) {
      deps.io.err(`[channel] ${e.message}`);
      return 1;
    }
    throw e;
  }
}

// packages/cli/src/commands/gen-router.ts
import { readFileSync as readFileSync17 } from "node:fs";
function sq(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}
function safeSeg(s) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
}
var GEN_TRACKS = ["pm", "frontend", "backend"];
async function cmdGenRouterSh(deps, manifestPath2) {
  if (!manifestPath2) {
    deps.io.err("_gen-router-sh: \u7F3A manifest \u8DEF\u5F84\u53C2\u6570");
    return 2;
  }
  try {
    readFileSync17(manifestPath2, "utf8");
    const m = loadManifest(manifestPath2);
    const out = ["# AUTO-GENERATED by pipeline _gen-router-sh from templates/manifest.yaml \u2014 \u52FF\u624B\u6539"];
    out.push(genRouterSh(m.routerPatterns));
    for (const phase of m.phases) {
      if (!safeSeg(phase)) continue;
      const bc = m.breadcrumbs[phase];
      if (bc !== void 0) out.push(`BREADCRUMB_${phase}=${sq(bc)}`);
    }
    for (const phase of m.phases) {
      if (!safeSeg(phase)) continue;
      for (const track of GEN_TRACKS) {
        const rec = skillsFor(m.recommendedSkills, phase, track);
        const mand = skillsFor(m.mandatorySkills, phase, track);
        if (rec.length) out.push(`RECSKILL_${phase}_${track}=${sq(rec.join(", "))}`);
        if (mand.length) out.push(`MANDSKILL_${phase}_${track}=${sq(mand.join(", "))}`);
      }
    }
    deps.io.out(out.join("\n"));
    return 0;
  } catch (e) {
    deps.io.err(`_gen-router-sh: ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
}

// packages/cli/src/commands/handoff.ts
function scalarField(v) {
  if (v === void 0) return "";
  return Array.isArray(v) ? v.join(",") : v;
}
function renderJson(result) {
  return JSON.stringify({
    change: result.name,
    phase: result.phase,
    aggregate: result.aggregate,
    docs: result.docs.map((d) => ({
      label: d.label,
      path: d.path,
      stats: d.doc.stats,
      title: d.doc.title,
      headings: d.doc.headings,
      decisions: d.doc.decisions,
      constraints: d.doc.constraints,
      openTodos: d.doc.openTodos,
      doneTodoCount: d.doc.doneTodoCount,
      keyFields: d.doc.keyFields,
      summary: d.summary
    }))
  });
}
function pct(ratio) {
  return Math.round(ratio * 100);
}
function renderText(deps, result) {
  deps.io.out(`# Handoff: ${result.name} (phase ${result.phase})`);
  if (result.docs.length === 0) {
    deps.io.out("# No handoff documents found for this phase.");
    deps.io.err(`[HANDOFF] ${result.name} @ ${result.phase}: \u65E0\u53EF\u538B\u7F29\u4EA7\u51FA\u6587\u6863\uFF08\u76F8\u4F4D\u65E0 upstream doc \u6216\u6587\u4EF6\u7F3A\u5931/\u7A7A\uFF09`);
    return;
  }
  const agg = result.aggregate;
  deps.io.out(
    `# Compression: ${pct(agg.ratio)}% (${agg.originalChars} \u2192 ${agg.compressedChars} chars, ${result.docs.length} doc(s))`
  );
  for (const d of result.docs) {
    deps.io.out("");
    deps.io.out(`## ${d.path} \u2014 ${pct(d.doc.stats.ratio)}% (${d.doc.stats.originalChars} \u2192 ${d.doc.stats.compressedChars} chars)`);
    for (const line of d.summary.split("\n")) deps.io.out(line);
  }
}
async function cmdHandoff(deps, name2, opts, fs = nodeHandoffFs()) {
  if (name2 === void 0 || name2 === "" || !isValidChangeName(name2)) {
    deps.io.err(`ERROR: change-name \u975E\u6CD5: '${name2 ?? ""}' (\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _)`);
    return 1;
  }
  const dir = changeDir(deps.cwd, name2);
  let state;
  try {
    state = await deps.store.read(dir);
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`);
    return 1;
  }
  const phase = opts.phase ?? scalarField(state.fields.phase);
  const result = buildHandoff(
    {
      name: name2,
      phase,
      cwd: deps.cwd,
      changeDirRel: `openspec/changes/${name2}`,
      fields: state.fields
    },
    fs
  );
  if (opts.json) {
    deps.io.out(renderJson(result));
    return 0;
  }
  renderText(deps, result);
  return 0;
}

// packages/cli/src/commands/init.ts
import { createInterface as createInterface2 } from "node:readline/promises";
var REAL_INIT_WIZARD_ENV = {
  isInteractive: () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
  makePrompter: () => {
    const rl = createInterface2({ input: process.stdin, output: process.stdout });
    return { ask: (prompt) => rl.question(prompt), close: () => rl.close() };
  }
};
var WIZARD_PRESETS = ["full", "hotfix", "tweak"];
async function askValidated(p, deps, label, dflt, validate) {
  for (; ; ) {
    const hasDflt = dflt !== void 0 && dflt !== "";
    const ans = (await p.ask(hasDflt ? `${label} [${dflt}]: ` : `${label}\uFF08\u5FC5\u586B\uFF09: `)).trim();
    const val = ans === "" ? dflt ?? "" : ans;
    if (val === "") {
      deps.io.err("\u8BE5\u9879\u5FC5\u586B\uFF0C\u8BF7\u8F93\u5165\u4E00\u4E2A\u503C\u3002");
      continue;
    }
    const err = validate(val);
    if (err !== null) {
      deps.io.err(err);
      continue;
    }
    return val;
  }
}
async function askPlain(p, label, dflt) {
  const ans = (await p.ask(dflt ? `${label} [${dflt}]: ` : `${label}: `)).trim();
  return ans === "" ? dflt : ans;
}
async function runInitWizard(deps, flags, env) {
  const p = env.makePrompter();
  try {
    deps.io.out("[init] \u4EA4\u4E92\u5411\u5BFC \u2014\u2014 \u6BCF\u95EE\u5C55\u793A\u9ED8\u8BA4\u503C\uFF08\u4E2D\u62EC\u53F7\u5185\uFF09\uFF0C\u76F4\u63A5\u56DE\u8F66\u5373\u6536\u9ED8\u8BA4\u3002");
    const track = await askValidated(
      p,
      deps,
      "track\uFF08chat|pm|frontend|backend\uFF09",
      flags.track,
      (s) => TRACKS.includes(s) ? null : `ERROR: \u975E\u6CD5 track '${s}'\uFF0C\u5141\u8BB8: ${TRACKS.join(" | ")}`
    );
    const preset = await askValidated(
      p,
      deps,
      "preset\uFF08full|hotfix|tweak\uFF09",
      flags.preset,
      // 向导仅收标准枚举（BT6 小白防错——提示列了枚举就必须校验，否则 'ful' 静默建出无效 change）；
      // 例外（codex review P2）：--preset flag 已给的值是专家预授权——只缺 --track 进向导时，
      // 回车收下该自定义 preset 必须放行，否则 flag 开放集能力在向导路径被倒灌拒绝。
      // 手敲的新值仍收紧标准枚举（小白保护不变）；纯自定义走全 flag 路径亦零回归。
      (s) => s !== "" && s === flags.preset ? null : WIZARD_PRESETS.includes(s) ? null : `ERROR: \u975E\u6CD5 preset '${s}'\uFF0C\u5141\u8BB8: ${WIZARD_PRESETS.join(" | ")}\uFF08\u81EA\u5B9A\u4E49 preset \u8BF7\u8D70 --preset flag\uFF09`
    );
    const userRaw = await askPlain(p, "user\uFF08created_by\uFF0C\u53EF\u7A7A\uFF09", flags.user ?? "");
    const workflowRaw = await askPlain(p, "workflow\uFF08\u81EA\u5B9A\u4E49 workflow \u540D\uFF0C\u7F3A\u7701 default\uFF09", flags.workflow ?? "");
    return {
      ...flags,
      track,
      preset,
      user: userRaw === "" ? void 0 : userRaw,
      workflow: workflowRaw === "" ? void 0 : workflowRaw
    };
  } finally {
    p.close();
  }
}
async function cmdInit(deps, name2, opts, env = REAL_INIT_WIZARD_ENV) {
  if (!isValidChangeName(name2)) {
    deps.io.err(`ERROR: change-name \u975E\u6CD5: '${name2}' (\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _)`);
    return 1;
  }
  if (!opts.track || !opts.preset) {
    if (!env.isInteractive()) {
      const missing = [!opts.track ? "--track" : null, !opts.preset ? "--preset" : null].filter(Boolean).join(" ");
      deps.io.err(`ERROR: \u975E\u4EA4\u4E92\u6A21\u5F0F\u7F3A\u5C11\u5FC5\u586B\u9879 ${missing}\uFF08agent/CI \u9700\u663E\u5F0F\u63D0\u4F9B\uFF1BTTY \u4E0B\u7701\u7565\u4F1A\u8D70\u4EA4\u4E92\u5411\u5BFC\uFF09`);
      return 1;
    }
    opts = await runInitWizard(deps, opts, env);
  }
  if (!TRACKS.includes(opts.track ?? "")) {
    deps.io.err(`ERROR: \u975E\u6CD5 track '${opts.track}'\uFF0C\u5141\u8BB8: ${TRACKS.join(" | ")}`);
    return 1;
  }
  if (!opts.preset) {
    deps.io.err("ERROR: preset \u4E0D\u80FD\u4E3A\u7A7A");
    return 1;
  }
  let customStart;
  if (opts.workflow && opts.workflow !== "default") {
    let wf;
    try {
      wf = loadWorkflow(deps.cwd, opts.workflow);
    } catch (e) {
      deps.io.err(errMsg(e));
      return 1;
    }
    if (!wf) {
      deps.io.err(`ERROR: workflow '${opts.workflow}' \u672A\u627E\u5230\uFF08\u671F\u671B .pipeline/workflows/${opts.workflow}.yaml\uFF09`);
      return 1;
    }
    const first = firstStep(wf);
    if (!first) {
      deps.io.err(`ERROR: workflow '${opts.workflow}' \u672A\u58F0\u660E\u4EFB\u4F55 step`);
      return 1;
    }
    customStart = { workflow: opts.workflow, phase: first.id };
  }
  try {
    const created = await deps.store.init({
      repoRoot: deps.cwd,
      name: name2,
      track: opts.track,
      preset: opts.preset,
      user: opts.user,
      clock: deps.clock
    });
    if (customStart) {
      await deps.store.setMany(created, { workflow: customStart.workflow, phase: customStart.phase });
    }
    await recordHistory(deps, created, {
      ts: deps.clock(),
      kind: "init",
      ...opts.user ? { by: opts.user } : {}
    });
    if (deps.registerProject) {
      try {
        await deps.registerProject(deps.cwd);
      } catch (e) {
        deps.io.err(`WARN: \u9879\u76EE\u6CE8\u518C\u8868\u767B\u8BB0\u5931\u8D25: ${errMsg(e)}`);
      }
    }
    deps.io.err(`[INIT] ${created}`);
    return 0;
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`);
    return 1;
  }
}

// packages/cli/src/commands/loops.ts
import { mkdirSync as mkdirSync6, readFileSync as readFileSync18, readdirSync as readdirSync4, writeFileSync as writeFileSync5 } from "node:fs";
import { dirname as dirname7, isAbsolute as isAbsolute3, join as join31 } from "node:path";
import { createInterface as createInterface3 } from "node:readline/promises";
function readTopLevelScalars(absPath) {
  let text;
  try {
    text = readFileSync18(absPath, "utf8");
  } catch {
    return null;
  }
  const out = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line === "" || /^\s/.test(line) || line.trimStart().startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][\w.-]*):\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (!(v.startsWith('"') || v.startsWith("'"))) {
      const cm = v.match(/^(.*?)\s+#.*$/);
      if (cm) v = cm[1].trimEnd();
    } else if (v.length >= 2 && v[0] === v[v.length - 1]) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}
function sandboxPipelineYaml(repoRoot, name2, worktree) {
  let base;
  if (worktree && worktree.trim() !== "") {
    const w = worktree.trim();
    base = isAbsolute3(w) ? w : join31(repoRoot, w);
  } else {
    base = join31(repoRoot, ".sandcastle", "worktrees", `sandcastle-pipeline-${name2}`);
  }
  return join31(base, "openspec", "changes", name2, ".pipeline.yaml");
}
var REAL_LOOPS_FS = {
  loadRegistry: (repoRoot) => loadRegistry(repoRoot),
  readProgress: (repoRoot) => {
    try {
      return readFileSync18(join31(repoRoot, ".superpowers", "loops", "progress.md"), "utf8");
    } catch {
      return null;
    }
  },
  listChanges: (repoRoot, changePrefix) => {
    try {
      return readdirSync4(join31(repoRoot, "openspec", "changes"), { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== "archive" && e.name.startsWith(changePrefix)).map((e) => e.name).sort();
    } catch {
      return [];
    }
  },
  readChangeFields: (repoRoot, name2) => readTopLevelScalars(join31(repoRoot, "openspec", "changes", name2, ".pipeline.yaml")),
  readSandboxFields: (repoRoot, name2, worktree) => readTopLevelScalars(sandboxPipelineYaml(repoRoot, name2, worktree))
};
var REAL_DRIFT_FS = {
  loadRegistry: (repoRoot) => loadRegistry(repoRoot),
  readRunLog: (repoRoot) => REAL_LOOPS_FS.readProgress(repoRoot),
  readLoopDoc: (repoRoot) => {
    try {
      return readFileSync18(join31(repoRoot, "LOOP.md"), "utf8");
    } catch {
      return null;
    }
  }
};
var REAL_GRADUATION_FS = {
  loadRegistry: (repoRoot) => loadRegistry(repoRoot),
  readRunLog: (repoRoot) => REAL_LOOPS_FS.readProgress(repoRoot),
  readLoopDoc: (repoRoot) => REAL_DRIFT_FS.readLoopDoc(repoRoot),
  readRegistryText: (repoRoot) => {
    try {
      return readFileSync18(join31(repoRoot, ".pipeline", "loops.yaml"), "utf8");
    } catch {
      return null;
    }
  },
  writeRegistryText: (repoRoot, text) => writeFileSync5(join31(repoRoot, ".pipeline", "loops.yaml"), text, "utf8")
};
function parseArgs(args) {
  let json = false;
  let loop = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") json = true;
    else if (a === "--loop") loop = args[++i] ?? null;
  }
  return { json, loop };
}
var pad = (s, n) => s.length >= n ? s : s + " ".repeat(n - s.length);
function loopSummaryLine(l) {
  const prefix = l.change_prefix === null ? "(none)" : l.change_prefix;
  return `  ${pad(l.id, 16)} ${pad(l.kind, 13)} ${pad(l.cadence, 11)} status=${pad(l.status, 8)} ${l.autonomy_level}/${enforcementFor(l.autonomy_level)}  budget=${l.budget.max_runs_per_day}/${l.budget.max_in_flight}  prefix=${prefix}`;
}
function printRegistryTable(deps, reg) {
  deps.io.out(`[LOOPS] ${reg.loops.length} registered`);
  for (const l of reg.loops) deps.io.out(loopSummaryLine(l));
}
function printReportTable(deps, report) {
  deps.io.out(`${pad("id", 20)} ${pad("verdict", 6)} ${pad("enforce", 13)} rules`);
  for (const v of report.verdicts) {
    const rules = v.reasons.map((r) => r.rule).join(",") || "-";
    deps.io.out(`${pad(v.id, 20)} ${pad(v.verdict, 6)} ${pad(v.enforcement, 13)} ${rules}`);
  }
  for (const s of report.skipped) deps.io.out(`${pad(s.id, 20)} ${pad("skip", 6)} ${pad("-", 13)} ${s.reason}`);
  if (report.notes.length > 0) {
    deps.io.out("notes:");
    for (const n of report.notes) deps.io.out(`  ${n}`);
  }
}
function cmdList2(deps, p, fs) {
  const { data, errors } = fs.loadRegistry(deps.cwd);
  if (errors.length > 0) {
    for (const e of errors) deps.io.err(`ERROR: ${e}`);
    return 1;
  }
  if (data === null) {
    deps.io.out("(no loops registry) .pipeline/loops.yaml \u672A\u627E\u5230\u2014\u2014\u672C\u9879\u76EE\u65E0\u767B\u8BB0 loop\uFF08\u5E38\u6001\uFF0C\u975E\u9519\u8BEF\uFF09");
    return 0;
  }
  if (p.json) {
    deps.io.out(JSON.stringify(data, null, 2));
    return 0;
  }
  printRegistryTable(deps, data);
  return 0;
}
function cmdEnforce(deps, p, fs) {
  const now = new Date(deps.clock());
  const { report, errors, exitCode } = buildReport(deps.cwd, { onlyLoop: p.loop, now }, fs);
  if (errors.length > 0 || report === null) {
    for (const e of errors) deps.io.err(`ERROR: ${e}`);
    return exitCode;
  }
  if (p.json) {
    deps.io.out(JSON.stringify(report, null, 2));
    return exitCode;
  }
  printReportTable(deps, report);
  return exitCode;
}
function cmdStatus(deps, fs) {
  const { data, errors } = fs.loadRegistry(deps.cwd);
  if (errors.length > 0) {
    for (const e of errors) deps.io.err(`ERROR: ${e}`);
    return 1;
  }
  if (data === null) {
    deps.io.out("(no loops registry) .pipeline/loops.yaml \u672A\u627E\u5230");
    return 0;
  }
  const now = new Date(deps.clock());
  const { report } = buildReport(deps.cwd, { now }, fs);
  const verdictById = new Map((report?.verdicts ?? []).map((v) => [v.id, v.verdict]));
  deps.io.out("[LOOPS status]");
  for (const l of data.loops) {
    const verdict = verdictById.get(l.id) ?? "-(skip)";
    deps.io.out(`  ${pad(l.id, 16)} status=${pad(l.status, 8)} verdict=${pad(verdict, 8)} ${l.autonomy_level}/${enforcementFor(l.autonomy_level)}`);
  }
  return 0;
}
function positionalLoop(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--loop") {
      i++;
      continue;
    }
    if (a.startsWith("--")) continue;
    return a;
  }
  return null;
}
function toBudgetFs(fs) {
  return { loadRegistry: fs.loadRegistry, readRunLog: fs.readProgress };
}
function printBudgetTable(deps, report) {
  deps.io.out("[LOOPS budget \xB7 circuit breaker]");
  for (const s of report.statuses) {
    const max = s.maxTokensPerDay === null ? "(none)" : String(s.maxTokensPerDay);
    const remaining = s.remaining === null ? "-" : String(s.remaining);
    const enf = s.reportOnly ? "report-only" : s.autonomyLevel === "L2" ? "assisted" : "unattended";
    deps.io.out(
      `  ${pad(s.id, 16)} breaker=${pad(s.breaker, 8)} spent=${s.spentToday}/${max} remaining=${pad(remaining, 8)} ${s.autonomyLevel}/${enf}  on_exceed=${s.onExceed}`
    );
    deps.io.out(`    ${s.reason}`);
  }
}
function printCostTable(deps, report) {
  deps.io.out("[LOOPS cost \xB7 estimate]");
  for (const e of report.estimates) {
    const runs = e.runsPerDay === null ? "(continuous)" : String(e.runsPerDay);
    const est = e.estimatedTokensPerDay === null ? "-" : `${e.estimatedTokensPerDay}/day`;
    const max = e.maxTokensPerDay === null ? "(none)" : String(e.maxTokensPerDay);
    const within = e.withinBudget === null ? "-" : e.withinBudget ? "yes" : "NO";
    const headroom = e.headroom === null ? "-" : String(e.headroom);
    deps.io.out(
      `  ${pad(e.id, 16)} cadence=${pad(e.cadence, 11)} runs/day=${pad(runs, 12)} pattern=${pad(e.pattern, 12)} tokens/run=${e.tokensPerRun}  est=${pad(est, 12)} budget=${pad(max, 8)} within=${pad(within, 4)} headroom=${headroom}`
    );
  }
}
function cmdBudget(deps, args, fs) {
  const p = parseArgs(args);
  const onlyLoop = p.loop ?? positionalLoop(args);
  const now = new Date(deps.clock());
  const { report, errors, exitCode } = buildBudgetReport(deps.cwd, onlyLoop, now, toBudgetFs(fs));
  if (errors.length > 0 || report === null) {
    for (const e of errors) deps.io.err(`ERROR: ${e}`);
    return exitCode;
  }
  if (p.json) {
    deps.io.out(JSON.stringify(report, null, 2));
    return exitCode;
  }
  printBudgetTable(deps, report);
  return exitCode;
}
function cmdCost(deps, args, fs) {
  const p = parseArgs(args);
  const onlyLoop = p.loop ?? positionalLoop(args);
  const now = new Date(deps.clock());
  const { report, errors, exitCode } = buildCostReport(deps.cwd, onlyLoop, now, toBudgetFs(fs));
  if (errors.length > 0 || report === null) {
    for (const e of errors) deps.io.err(`ERROR: ${e}`);
    return exitCode;
  }
  if (p.json) {
    deps.io.out(JSON.stringify(report, null, 2));
    return exitCode;
  }
  printCostTable(deps, report);
  return exitCode;
}
function printDriftTable(deps, report) {
  deps.io.out("[LOOPS drift \xB7 loop-sync\uFF08\u58F0\u660E vs \u5B9E\u9645\u5BF9\u8D26\uFF09]");
  deps.io.out(`  checked=[${report.checked.join(", ")}]  ${report.clean ? "CLEAN\uFF08\u65E0\u6F02\u79FB\uFF09" : `${report.items.length} \u6F02\u79FB\u9879`}`);
  for (const it of report.items) {
    deps.io.out(`  ${pad(it.severity, 4)} ${pad(it.dimension, 17)} ${pad(it.loop, 16)} ${it.detail}`);
    deps.io.out(`       \u2192 ${it.suggestion}`);
  }
}
function printAuditTable(deps, report) {
  deps.io.out("[LOOPS audit \xB7 loop-ready score 0-100]");
  for (const s of report.scores) {
    deps.io.out(`  ${pad(s.id, 16)} score=${pad(String(s.score), 4)}/100 band=${pad(s.band, 12)}`);
    const dimline = s.dimensions.map((d) => `${d.name}=${d.score}/${d.max}`).join("  ");
    deps.io.out(`    ${dimline}`);
    for (const sug of s.suggestions) deps.io.out(`    \xB7 ${sug}`);
  }
}
function cmdDrift(deps, args, fs) {
  const p = parseArgs(args);
  const onlyLoop = p.loop ?? positionalLoop(args);
  const now = new Date(deps.clock());
  const { report, errors, exitCode } = buildDriftReport(deps.cwd, onlyLoop, now, fs);
  if (errors.length > 0 || report === null) {
    for (const e of errors) deps.io.err(`ERROR: ${e}`);
    return exitCode;
  }
  if (p.json) {
    deps.io.out(JSON.stringify(report, null, 2));
    return exitCode;
  }
  printDriftTable(deps, report);
  return exitCode;
}
function cmdAudit(deps, args, fs) {
  const p = parseArgs(args);
  const onlyLoop = p.loop ?? positionalLoop(args);
  const now = new Date(deps.clock());
  const { report, errors, exitCode } = buildAuditReport(deps.cwd, onlyLoop, now, fs);
  if (errors.length > 0 || report === null) {
    for (const e of errors) deps.io.err(`ERROR: ${e}`);
    return exitCode;
  }
  if (p.json) {
    deps.io.out(JSON.stringify(report, null, 2));
    return exitCode;
  }
  printAuditTable(deps, report);
  return exitCode;
}
function positionals(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--loop") {
      i++;
      continue;
    }
    if (a.startsWith("--")) continue;
    out.push(a);
  }
  return out;
}
function printGraduationTable(deps, report) {
  deps.io.out("[LOOPS graduate \xB7 \u5206\u7EA7\u653E\u6743\u6BD5\u4E1A\u5236 L1\u2192L3]");
  for (const v of report.verdicts) {
    deps.io.out(
      `  ${pad(v.id, 16)} current=${v.current}/${enforcementFor(v.current)} \u2192 recommended=${v.recommended}/${enforcementFor(v.recommended)}  can-graduate=${v.canGraduate ? "yes" : "no"}`
    );
    deps.io.out(`    loop-ready=${v.readinessScore}/${v.readinessBand}  drift=${v.driftCount}  breaker=${v.breaker}  fail_streak=${v.failStreak}  runs=${v.runs}`);
    if (v.demotionReason !== null) deps.io.out(`    \u26A0 \u964D\u6863\u4FE1\u53F7\uFF1A${v.demotionReason}`);
    for (const b of v.blockers) deps.io.out(`    \xB7 blocker: ${b}`);
    if (v.canGraduate) deps.io.out(`    \u2192 \u53EF\u5347 ${v.recommended}\uFF1Apipeline loops level ${v.id} set ${v.recommended} --confirm`);
  }
}
function cmdGraduate(deps, args, fs) {
  const p = parseArgs(args);
  const onlyLoop = p.loop ?? positionalLoop(args);
  const now = new Date(deps.clock());
  const { report, errors, exitCode } = buildGraduationReport(deps.cwd, onlyLoop, now, fs);
  if (errors.length > 0 || report === null) {
    for (const e of errors) deps.io.err(`ERROR: ${e}`);
    return exitCode;
  }
  if (p.json) {
    deps.io.out(JSON.stringify(report, null, 2));
    return exitCode;
  }
  printGraduationTable(deps, report);
  return exitCode;
}
function printLevelView(deps, v) {
  deps.io.out(`[LOOPS level \xB7 ${v.id}]`);
  deps.io.out(
    `  current=${v.current}/${enforcementFor(v.current)}  recommended=${v.recommended}/${enforcementFor(v.recommended)}  can-graduate=${v.canGraduate ? "yes" : "no"}`
  );
  deps.io.out(`  loop-ready=${v.readinessScore}/${v.readinessBand}  drift=${v.driftCount}  breaker=${v.breaker}  fail_streak=${v.failStreak}  runs=${v.runs}`);
  if (v.demotionReason !== null) deps.io.out(`  \u26A0 \u964D\u6863\u4FE1\u53F7\uFF1A${v.demotionReason} \u2192 \u5EFA\u8BAE\u964D ${v.recommended}`);
  for (const b of v.blockers) deps.io.out(`  \xB7 blocker: ${b}`);
  if (v.canGraduate) deps.io.out(`  \u2192 \u53EF\u5347 ${v.recommended}\uFF1Apipeline loops level ${v.id} set ${v.recommended} --confirm`);
}
function cmdLevel(deps, args, fs) {
  const p = parseArgs(args);
  const confirm = args.includes("--confirm") || args.includes("--yes");
  const pos = positionals(args);
  const setPos = pos.indexOf("set");
  const isSet = setPos !== -1;
  const target = isSet ? pos[setPos + 1] : void 0;
  const loopId = p.loop ?? (pos[0] === "set" ? null : pos[0] ?? null);
  const now = new Date(deps.clock());
  if (loopId === null) {
    deps.io.err("ERROR: \u7528\u6CD5: loops level <loop> [set <L1|L2|L3>] [--confirm]");
    return 2;
  }
  if (!isSet) {
    const { report, errors, exitCode } = buildGraduationReport(deps.cwd, loopId, now, fs);
    if (errors.length > 0 || report === null) {
      for (const e of errors) deps.io.err(`ERROR: ${e}`);
      return exitCode;
    }
    const v = report.verdicts[0];
    if (p.json) {
      deps.io.out(JSON.stringify(v, null, 2));
      return 0;
    }
    printLevelView(deps, v);
    return 0;
  }
  if (target === void 0) {
    deps.io.err("ERROR: set \u9700\u6307\u5B9A\u76EE\u6807\u6863\uFF08L1/L2/L3\uFF09");
    return 2;
  }
  const res = applyLevelChange(deps.cwd, loopId, target, { now, confirm }, fs);
  if (res.exitCode === 3) {
    for (const e of res.errors) deps.io.err(`ERROR: ${e}`);
    return 3;
  }
  const plan = res.plan;
  if (res.exitCode === 2) {
    for (const e of res.errors) deps.io.err(`ERROR: ${e}`);
    return 2;
  }
  if (plan.kind === "noop") {
    deps.io.out(`[LOOPS level set] ${plan.id} \u5DF2\u5728 ${plan.from}\uFF0C\u65E0\u9700\u6539\u6863`);
    return 0;
  }
  if (res.applied) {
    deps.io.out(`[LOOPS level set] ${plan.id} ${plan.from} \u2192 ${plan.to}\uFF08${plan.kind}\uFF09\u5DF2\u843D\u76D8 .pipeline/loops.yaml`);
    return 0;
  }
  deps.io.out(
    `[LOOPS level set] ${plan.id} ${plan.from} \u2192 ${plan.to}\uFF08${plan.kind}\uFF09\u51C6\u5165\u901A\u8FC7 \u2014\u2014 dry-run\uFF08\u672A\u843D\u76D8\uFF09\u3002\u52A0 --confirm \u843D\u76D8\uFF1Apipeline loops level ${plan.id} set ${plan.to} --confirm`
  );
  return 0;
}
var RISK_CADENCE = { low: "4h", medium: "2h", high: "1h" };
var RISK_MAX_RUNS = { low: 48, medium: 24, high: 8 };
var DEFAULT_KILL_CRITERIA = ["no-change-3", "budget-burn-2d"];
var DEFAULT_HUMAN_GATES = ["explore", "spec", "verify"];
var DEFAULT_MAX_TOKENS_PER_DAY = 1e5;
var DEFAULT_STATE = ".superpowers/loops/progress.md";
var INIT_ID_RE = /^[a-z][a-z0-9-]*$/;
var INIT_CADENCE_RE = /^([0-9]+[mhd](-[0-9]+[mhd])?|continuous)$/;
var GOAL_MIN_LEN = 10;
function derivePrefix(id) {
  const initials = id.split("-").filter((s) => s.length > 0).map((s) => s[0]).join("");
  return `${initials}-`;
}
function validateId(s) {
  return INIT_ID_RE.test(s) ? null : `id \u975E\u6CD5\u300C${s}\u300D\uFF1A\u987B\u5339\u914D ${INIT_ID_RE.source}\uFF08\u5C0F\u5199\u5B57\u6BCD\u5F00\u5934\uFF0C\u4EC5\u5C0F\u5199\u5B57\u6BCD/\u6570\u5B57/\u8FDE\u5B57\u7B26\uFF09`;
}
function validateGoal(s) {
  return s.length >= GOAL_MIN_LEN ? null : `goal \u8FC7\u77ED\uFF08\u5F53\u524D ${s.length} \u5B57\u7B26\uFF09\uFF1A\u987B \u2265${GOAL_MIN_LEN} \u5B57\u7B26`;
}
function validateCadence(s) {
  return INIT_CADENCE_RE.test(s) ? null : `cadence \u975E\u6CD5\u300C${s}\u300D\uFF1A\u987B\u5339\u914D ${INIT_CADENCE_RE.source}\uFF08\u5982 4h / 30m / 1h-2h / continuous\uFF09`;
}
function validateRisk(s) {
  return ["low", "medium", "high"].includes(s) ? null : `risk \u975E\u6CD5\u300C${s}\u300D\uFF1A\u987B\u4E3A low|medium|high`;
}
function validateKind(s) {
  return ["orchestrator", "executor"].includes(s) ? null : `kind \u975E\u6CD5\u300C${s}\u300D\uFF1A\u987B\u4E3A orchestrator|executor`;
}
function csv2(v) {
  return v.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}
function parseInitArgs(args) {
  const out = { yes: false, json: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case "--yes":
        out.yes = true;
        break;
      case "--json":
        out.json = true;
        break;
      case "--id":
        out.id = args[++i];
        break;
      case "--name":
        out.name = args[++i];
        break;
      case "--goal":
        out.goal = args[++i];
        break;
      case "--kind":
        out.kind = args[++i];
        break;
      case "--prefix":
        out.prefix = args[++i];
        break;
      case "--risk":
        out.risk = args[++i];
        break;
      case "--runner":
        out.runner = args[++i];
        break;
      case "--cadence":
        out.cadence = args[++i];
        break;
      case "--phases":
        out.phases = csv2(args[++i] ?? "");
        break;
      case "--gates":
        out.gates = csv2(args[++i] ?? "");
        break;
      case "--kill":
        out.kill = csv2(args[++i] ?? "");
        break;
      case "--doc":
        out.doc = args[++i];
        break;
      default:
        break;
    }
  }
  return out;
}
function resolveDefaults(flags) {
  const missing = [];
  if (flags.id === void 0) missing.push("--id");
  if (flags.goal === void 0) missing.push("--goal");
  if (missing.length > 0) return { raw: null, missing };
  const id = flags.id;
  const risk = flags.risk ?? "low";
  const raw = {
    id,
    name: flags.name ?? id,
    goal: flags.goal,
    designDoc: flags.doc ?? `docs/loops/${id}.md`,
    prefix: flags.prefix === void 0 ? derivePrefix(id) : flags.prefix === "none" ? null : flags.prefix,
    kind: flags.kind ?? "orchestrator",
    runner: flags.runner ?? "claude-code",
    gates: flags.gates ?? [...DEFAULT_HUMAN_GATES],
    kill: flags.kill ?? [...DEFAULT_KILL_CRITERIA],
    risk,
    cadence: flags.cadence ?? RISK_CADENCE[risk] ?? RISK_CADENCE.low,
    phases: flags.phases ?? [...PHASES]
  };
  return { raw, missing: [] };
}
function assembleEntry(raw) {
  for (const check of [validateId(raw.id), validateGoal(raw.goal), validateKind(raw.kind), validateRisk(raw.risk), validateCadence(raw.cadence)]) {
    if (check !== null) return { entry: null, error: check };
  }
  const risk = raw.risk;
  const budget = {
    max_runs_per_day: RISK_MAX_RUNS[risk],
    max_in_flight: 1,
    on_exceed: "skip",
    max_tokens_per_day: DEFAULT_MAX_TOKENS_PER_DAY
  };
  const entry = {
    id: raw.id,
    name: raw.name,
    kind: raw.kind,
    goal: raw.goal,
    cadence: raw.cadence,
    risk,
    runner: raw.runner,
    change_prefix: raw.prefix,
    phases: raw.phases,
    human_gates: raw.gates,
    state: DEFAULT_STATE,
    design_doc: raw.designDoc,
    status: "paused",
    // 协议约定：硬 gate，无开关（拍板 P1）
    budget,
    kill_criteria: raw.kill
  };
  return { entry, error: null };
}
var REAL_INIT_ENV = {
  fs: {
    readText: (path6) => {
      try {
        return readFileSync18(path6, "utf8");
      } catch (e) {
        if (e.code === "ENOENT") return null;
        throw e;
      }
    },
    createExclusive: (path6, text) => {
      mkdirSync6(dirname7(path6), { recursive: true });
      writeFileSync5(path6, text, { flag: "wx" });
    },
    overwrite: (path6, text) => writeFileSync5(path6, text, "utf8")
  },
  addDraftMark: (path6, id) => addDraftMark(path6, id),
  isInteractive: () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
  makePrompter: () => {
    const rl = createInterface3({ input: process.stdin, output: process.stdout });
    return { ask: (prompt) => rl.question(prompt), close: () => rl.close() };
  }
};
async function askValidated2(p, deps, label, dflt, validate, required) {
  for (; ; ) {
    const hasDflt = dflt !== void 0 && dflt !== "";
    const ans = (await p.ask(hasDflt ? `${label} [${dflt}]: ` : `${label}${required ? "\uFF08\u5FC5\u586B\uFF09" : ""}: `)).trim();
    const val = ans === "" ? dflt ?? "" : ans;
    if (val === "" && required) {
      deps.io.err("\u8BE5\u9879\u5FC5\u586B\uFF0C\u8BF7\u8F93\u5165\u4E00\u4E2A\u503C\u3002");
      continue;
    }
    const err = validate(val);
    if (err !== null) {
      deps.io.err(err);
      continue;
    }
    return val;
  }
}
async function askPlain2(p, label, dflt) {
  const ans = (await p.ask(`${label} [${dflt}]: `)).trim();
  return ans === "" ? dflt : ans;
}
async function askCsv(p, label, dflt) {
  const ans = (await p.ask(`${label} [${dflt.join(",")}]: `)).trim();
  return ans === "" ? [...dflt] : csv2(ans);
}
async function runWizard(deps, flags, env) {
  const p = env.makePrompter();
  try {
    deps.io.out("[loops init] \u4EA4\u4E92\u5411\u5BFC \u2014\u2014 \u6BCF\u95EE\u5C55\u793A\u63A8\u5BFC\u9ED8\u8BA4\u503C\uFF0C\u76F4\u63A5\u56DE\u8F66\u5373\u6536\u9ED8\u8BA4\u3002");
    const id = await askValidated2(p, deps, "\u76EE\u6807 loop id", flags.id, validateId, true);
    const goal = await askValidated2(p, deps, "\u4E00\u53E5\u8BDD\u76EE\u6807\uFF08\u226510 \u5B57\u7B26\uFF09", flags.goal, validateGoal, true);
    const designDoc = await askPlain2(p, "\u8BBE\u8BA1\u6587\u6863\u8DEF\u5F84", flags.doc ?? `docs/loops/${id}.md`);
    const prefixRaw = await askPlain2(p, "change \u524D\u7F00\uFF08none = \u4E0D\u8BBE\u524D\u7F00\uFF09", flags.prefix ?? derivePrefix(id));
    const prefix = prefixRaw === "none" ? null : prefixRaw;
    const kind = await askValidated2(p, deps, "\u7C7B\u578B\uFF08orchestrator|executor\uFF09", flags.kind ?? "orchestrator", validateKind, false);
    const runner = await askPlain2(p, "\u6267\u884C agent\uFF08runner\uFF09", flags.runner ?? "claude-code");
    const gates = await askCsv(p, "\u590D\u6838\u95E8\u9636\u6BB5\uFF08CSV\uFF09", flags.gates ?? DEFAULT_HUMAN_GATES);
    const kill = await askCsv(p, "\u7EC8\u6B62\u5224\u636E\uFF08CSV\uFF09", flags.kill ?? DEFAULT_KILL_CRITERIA);
    const risk = await askValidated2(p, deps, "\u98CE\u9669\u6863\uFF08low|medium|high\uFF09", flags.risk ?? "low", validateRisk, false);
    const cadence = await askValidated2(p, deps, "\u8282\u594F cadence", flags.cadence ?? RISK_CADENCE[risk], validateCadence, false);
    const phases = await askCsv(p, "\u9636\u6BB5\uFF08CSV\uFF09", flags.phases ?? PHASES);
    return { id, name: flags.name ?? id, goal, designDoc, prefix, kind, runner, gates, kill, risk, cadence, phases };
  } finally {
    p.close();
  }
}
function initFail(deps, json, msg) {
  if (json) deps.io.out(JSON.stringify({ ok: false, error: msg }));
  else deps.io.err(`ERROR: ${msg}`);
  return 1;
}
async function cmdInit2(deps, args, env = REAL_INIT_ENV) {
  const flags = parseInitArgs(args);
  const interactive = !flags.yes && env.isInteractive();
  let raw;
  if (interactive) {
    raw = await runWizard(deps, flags, env);
  } else {
    const { raw: resolved, missing } = resolveDefaults(flags);
    if (resolved === null) {
      return initFail(
        deps,
        flags.json,
        `\u975E\u4EA4\u4E92\u6A21\u5F0F\u7F3A\u5C11\u5FC5\u586B\u9879\uFF1A${missing.join(" ")}\uFF08agent/CI \u9700\u663E\u5F0F\u63D0\u4F9B\uFF1B\u6216\u5728 TTY \u4E0B\u53BB\u6389 --yes \u8D70\u4EA4\u4E92\u5411\u5BFC\uFF09`
      );
    }
    raw = resolved;
  }
  const { entry, error: assembleErr } = assembleEntry(raw);
  if (assembleErr !== null || entry === null) {
    return initFail(deps, flags.json, assembleErr ?? "\u7EC4\u88C5 loop \u6761\u76EE\u5931\u8D25");
  }
  const loopsPath = join31(deps.cwd, ".pipeline", "loops.yaml");
  const before = env.fs.readText(loopsPath);
  if (before === null) {
    const { text, error } = createLoopsYamlText(entry);
    if (error !== null || text === null) return initFail(deps, flags.json, error ?? "\u751F\u6210 loops.yaml \u5931\u8D25");
    try {
      env.fs.createExclusive(loopsPath, text);
    } catch (e) {
      const code = e.code;
      if (code === "EEXIST") {
        return initFail(deps, flags.json, `loops.yaml \u5728\u521B\u5EFA\u77AC\u95F4\u88AB\u5E76\u53D1\u521B\u5EFA\uFF08EEXIST\uFF0C${loopsPath}\uFF09\u2014\u2014\u8BF7\u91CD\u8DD1 init\uFF08\u5C06\u8D70\u8FFD\u52A0\u8DEF\u5F84\uFF09`);
      }
      return initFail(deps, flags.json, `\u5199 loops.yaml \u5931\u8D25\uFF1A${errMsg(e)}`);
    }
  } else {
    const { text, error } = appendLoopToYamlText(before, entry);
    if (error !== null || text === null) return initFail(deps, flags.json, error ?? "\u8FFD\u52A0 loops.yaml \u5931\u8D25");
    const current = env.fs.readText(loopsPath);
    if (current !== before) {
      return initFail(deps, flags.json, `CAS \u5931\u8D25\uFF1Aloops.yaml \u5728\u767B\u8BB0\u671F\u95F4\u88AB\u5E76\u53D1\u4FEE\u6539\uFF0C\u5DF2\u5982\u5B9E\u62D2\u7EDD\uFF08\u672A\u843D\u76D8\uFF0C${loopsPath}\uFF09`);
    }
    env.fs.overwrite(loopsPath, text);
  }
  try {
    await env.addDraftMark(draftMarksPath(deps.cwd), entry.id);
  } catch (e) {
    deps.io.err(`WARN: \u8349\u7A3F\u6807\u8BB0\u767B\u8BB0\u5931\u8D25\uFF08loop \u5DF2\u843D\u76D8\uFF0C\u4E0D\u5F71\u54CD dashboard \u5BA1\u9605\uFF0C\u4EC5\u5C11\u4E00\u679A\u5F85\u5BA1\u5FBD\u7AE0\uFF09\uFF1A${errMsg(e)}`);
  }
  if (!LOOP_RUNNERS.includes(entry.runner)) {
    deps.io.err(`WARN: "${entry.runner}" \u4E0D\u662F\u6807\u51C6 runner\uFF08\u4EC5 claude-code / codex\uFF09\uFF0C\u4ECD\u4F1A\u6267\u884C\u2014\u2014\u975E codex \u503C\u4E00\u5F8B\u8D70 claude-code\uFF08\u7F3A\u7701\uFF09\u8DEF\u5F84\u3002`);
  }
  if (flags.json) {
    deps.io.out(JSON.stringify({ ok: true, id: entry.id, path: loopsPath, draft: true }));
  } else {
    deps.io.out(`[loops init] \u5DF2\u767B\u8BB0\u8349\u7A3F loop\u300C${entry.id}\u300D\u2192 ${loopsPath}`);
    deps.io.out("\u5DF2\u4F5C\u4E3A\u8349\u7A3F\uFF08\u5DF2\u6682\u505C\uFF09\u767B\u8BB0\uFF1B\u6253\u5F00 dashboard \u5DE5\u4F5C\u53F0\u5BA1\u9605\uFF0C\u6279\u51C6\u540E\u542F\u7528\uFF1B\u9884\u7B97\u4E0E\u81EA\u4E3B\u7EA7\u522B\u5728\u5BA1\u9605\u9762\u8C03\u6574\uFF08\u5347\u6863\u8D70\u6BD5\u4E1A\u5236\uFF09\u3002");
  }
  return 0;
}
async function cmdLoops(deps, sub, args, fs = REAL_LOOPS_FS, driftFs = REAL_DRIFT_FS, graduationFs = REAL_GRADUATION_FS, initEnv = REAL_INIT_ENV) {
  const p = parseArgs(args);
  switch (sub || "list") {
    case "list":
      return cmdList2(deps, p, fs);
    case "enforce":
      return cmdEnforce(deps, p, fs);
    case "status":
      return cmdStatus(deps, fs);
    case "budget":
      return cmdBudget(deps, args, fs);
    case "cost":
      return cmdCost(deps, args, fs);
    case "drift":
      return cmdDrift(deps, args, driftFs);
    case "audit":
      return cmdAudit(deps, args, driftFs);
    case "graduate":
      return cmdGraduate(deps, args, graduationFs);
    case "level":
      return cmdLevel(deps, args, graduationFs);
    case "init":
      return cmdInit2(deps, args, initEnv);
    default:
      deps.io.err(`ERROR: \u672A\u77E5 loops \u5B50\u547D\u4EE4: ${sub}\uFF08\u652F\u6301: init list enforce status budget cost drift audit graduate level\uFF09`);
      return 1;
  }
}

// packages/cli/src/commands/mem.ts
import { resolve as resolve8 } from "node:path";
var VALID_PLATFORMS = ["claude", "codex", "opencode", "pi", "all"];
var MemDie = class extends Error {
};
function die2(msg) {
  throw new MemDie(msg);
}
function parseDate(raw) {
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
}
function parseOptionalNumberFlag(raw, name2, fallback) {
  if (raw === void 0 || raw === false) return fallback;
  if (typeof raw !== "string") die2(`${name2} requires a number`);
  const value = Number(raw);
  if (Number.isNaN(value) || !Number.isFinite(value)) die2(`bad ${name2}: ${raw}`);
  return value;
}
function buildFilter(deps, flags) {
  const platformRaw = typeof flags.platform === "string" ? flags.platform : "all";
  if (!VALID_PLATFORMS.includes(platformRaw)) die2(`unknown platform: ${platformRaw}`);
  let since = null;
  if (typeof flags.since === "string") {
    since = parseDate(flags.since);
    if (since === null) die2(`bad --since: ${flags.since}`);
  }
  let until = null;
  if (typeof flags.until === "string") {
    until = parseDate(`${flags.until}T23:59:59.999Z`);
    if (until === null) die2(`bad --until: ${flags.until}`);
  }
  let cwd;
  if (flags.global) {
    cwd = null;
  } else {
    const cwdFlag = typeof flags.cwd === "string" ? flags.cwd : deps.cwd;
    cwd = resolve8(cwdFlag);
  }
  const limit = parseOptionalNumberFlag(flags.limit, "--limit", 50);
  return { platform: platformRaw, since, until, cwd, limit };
}
function parsePhaseFlag(raw) {
  if (raw === void 0 || raw === false) return "all";
  if (raw === "brainstorm" || raw === "implement" || raw === "all") return raw;
  die2(`unknown --phase: ${String(raw)} (expected brainstorm|implement|all)`);
}
function maybeWarnOpencode(deps, f) {
  if ((f.platform === "all" || f.platform === "opencode") && !opencodeSqliteAvailable()) {
    deps.io.err("\u26A0\uFE0F  tl mem: OpenCode platform reader is unavailable on this Node runtime.");
    deps.io.err("    OpenCode reads require node:sqlite (Node >=22.13, or >=22.5 with --experimental-sqlite).");
  }
}
var iso10 = (ms) => new Date(ms).toISOString().slice(0, 10);
function ljust(s, n) {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
function rjust(s, n) {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}
function shortDate(iso) {
  if (!iso) return " ".repeat(9);
  return iso.slice(0, 16).replace("T", " ");
}
function shortPath(fs, p) {
  if (!p) return "(no cwd)";
  return p.split(fs.home).join("~");
}
function printSessions(deps, fs, rows) {
  if (!rows.length) {
    deps.io.out("(no sessions)");
    return;
  }
  for (const s of rows) {
    const sid = s.id.length > 12 ? s.id.slice(0, 12) : ljust(s.id, 12);
    const parentTag = s.parent_id ? `  \u21B3 child of ${s.parent_id.slice(0, 12)}` : "";
    const title = s.title ? `  \u2014 ${s.title}` : "";
    deps.io.out(
      `[${ljust(s.platform, 8)}] ${shortDate(s.updated || s.created)}  ${sid}  ${shortPath(fs, s.cwd)}${title}${parentTag}`
    );
  }
}
function searchMatchToJson(m, includeChildren) {
  const hit = m.hit;
  return {
    session: m.session,
    score: Math.round(m.score * 1e4) / 1e4,
    hit_count: hit.count,
    user_count: hit.userCount,
    asst_count: hit.asstCount,
    total_turns: hit.totalTurns,
    descendants_merged: includeChildren ? m.descendantsMerged : 0,
    excerpts: hit.excerpts
  };
}
function cmdList3(deps, p, fs) {
  const f = buildFilter(deps, p.flags);
  maybeWarnOpencode(deps, f);
  const rows = listMemSessions(fs, { filter: f });
  if (p.flags.json) {
    deps.io.out(JSON.stringify(rows, null, 2));
    return 0;
  }
  const scope = f.cwd ? `project=${shortPath(fs, f.cwd)}` : "global";
  let line = `scope: ${scope}  platform=${f.platform}`;
  if (f.since != null) line += `  since=${iso10(f.since)}`;
  if (f.until != null) line += `  until=${iso10(f.until)}`;
  deps.io.out(line);
  printSessions(deps, fs, rows);
  deps.io.out(`
${rows.length} session(s)`);
  return 0;
}
function cmdSearch(deps, p, fs) {
  const kw = p.positional[0];
  if (!kw) die2("usage: search <keyword>");
  const f = buildFilter(deps, p.flags);
  maybeWarnOpencode(deps, f);
  const includeChildren = p.flags["include-children"] === true;
  const result = searchMemSessions(fs, { keyword: kw, filter: f, includeChildren });
  const top = result.matches;
  if (p.flags.json) {
    deps.io.out(JSON.stringify(top.map((m) => searchMatchToJson(m, includeChildren)), null, 2));
    return 0;
  }
  const scope = f.cwd ? `project=${shortPath(fs, f.cwd)}` : "global";
  let head = `scope: ${scope}  keyword="${kw}"  platform=${f.platform}`;
  if (includeChildren) head += "  include-children=on";
  deps.io.out(head);
  if (!top.length) {
    deps.io.out("(no matches)");
    return 0;
  }
  for (const m of top) {
    const s = m.session;
    const idShort = s.id.slice(0, 12);
    const score = m.score.toFixed(3);
    const childTag = includeChildren && m.descendantsMerged > 0 ? `  +${m.descendantsMerged} child` : "";
    const title = s.title ? `  \u2014 ${s.title}` : "";
    const hit = m.hit;
    deps.io.out(
      `
[${ljust(s.platform, 8)}] ${shortDate(s.updated || s.created)}  ${idShort}  ${shortPath(fs, s.cwd)}  score=${score}  hits=${hit.count} (u=${hit.userCount},a=${hit.asstCount})  turns=${hit.totalTurns}${childTag}${title}`
    );
    for (const ex of hit.excerpts) deps.io.out(`    [${ex.role}] ${ex.snippet}`);
  }
  const extra = result.totalMatches > top.length ? ` (of ${result.totalMatches})` : "";
  deps.io.out(`
${top.length} session(s)${extra}`);
  return 0;
}
function cmdProjects(deps, p, fs) {
  const f = buildFilter(deps, { ...p.flags, global: true });
  maybeWarnOpencode(deps, f);
  const rows = listMemProjects(fs, { filter: f });
  const limit = parseOptionalNumberFlag(p.flags.limit, "--limit", 30);
  const top = rows.slice(0, limit);
  if (p.flags.json) {
    deps.io.out(JSON.stringify(top, null, 2));
    return 0;
  }
  let head = "active projects";
  if (f.since != null) head += `  since=${iso10(f.since)}`;
  if (f.until != null) head += `  until=${iso10(f.until)}`;
  deps.io.out(head);
  if (!top.length) {
    deps.io.out("(none)");
    return 0;
  }
  for (const r of top) {
    const parts = Object.entries(r.by_platform).filter(([, n]) => n > 0).map(([pl, n]) => `${pl}:${n}`).join(" ");
    deps.io.out(`${shortDate(r.last_active)}  sessions=${rjust(String(r.sessions), 3)} (${parts})  ${shortPath(fs, r.cwd)}`);
  }
  const extra = rows.length > top.length ? ` (of ${rows.length})` : "";
  deps.io.out(`
${top.length} project(s)${extra}`);
  return 0;
}
function cmdContext2(deps, p, fs) {
  const sid = p.positional[0];
  if (!sid) die2("usage: context <session-id> [--grep KW] [--turns N] [--around M]");
  const f = buildFilter(deps, p.flags);
  maybeWarnOpencode(deps, f);
  const grep = typeof p.flags.grep === "string" ? p.flags.grep : null;
  if (grep !== null && grep.split(/\s+/).filter(Boolean).length === 0) die2("--grep requires non-empty value");
  const nTurns = parseOptionalNumberFlag(p.flags.turns, "--turns", 3);
  const around = parseOptionalNumberFlag(p.flags.around, "--around", 1);
  const maxChars = parseOptionalNumberFlag(p.flags["max-chars"], "--max-chars", 6e3);
  const includeChildren = p.flags["include-children"] === true;
  const result = readMemContext(fs, {
    sessionId: sid,
    filter: f,
    grep,
    turns: nTurns,
    around,
    maxChars,
    includeChildren
  });
  const s = result.session;
  if (p.flags.json) {
    deps.io.out(
      JSON.stringify(
        {
          session: s,
          query: result.query,
          total_turns: result.totalTurns,
          total_hit_turns: result.totalHitTurns,
          merged_children: result.mergedChildren,
          turns: result.turns.map((t) => ({ idx: t.idx, role: t.role, text: t.text, is_hit: t.isHit }))
        },
        null,
        2
      )
    );
    return 0;
  }
  const shown = grep ? Math.min(result.totalHitTurns, nTurns) : Math.min(nTurns, result.totalTurns);
  deps.io.out(`# context: [${s.platform}] ${s.id}`);
  if (s.title) deps.io.out(`# title: ${s.title}`);
  if (s.cwd) deps.io.out(`# cwd:   ${shortPath(fs, s.cwd)}`);
  if (grep) deps.io.out(`# query: "${grep}"  hit_turns=${result.totalHitTurns}  showing top ${shown}`);
  else deps.io.out(`# no grep \u2014 showing first ${shown} turns of ${result.totalTurns}`);
  if (result.mergedChildren > 0) deps.io.out(`# merged_children: ${result.mergedChildren}`);
  deps.io.out(`# turns shown: ${result.turns.length}  budget_used: ${result.budgetUsed}/${result.maxChars} chars`);
  deps.io.out("");
  for (const t of result.turns) {
    const marker = t.isHit ? "  \u2190 hit" : "";
    deps.io.out(`## turn ${t.idx} (${t.role})${marker}
`);
    deps.io.out(t.text);
    deps.io.out("\n---\n");
  }
  return 0;
}
function cmdExtract(deps, p, fs) {
  const sid = p.positional[0];
  if (!sid) die2("usage: extract <session-id>");
  const f = buildFilter(deps, p.flags);
  maybeWarnOpencode(deps, f);
  const phase = parsePhaseFlag(p.flags.phase);
  const grep = typeof p.flags.grep === "string" ? p.flags.grep.toLowerCase() : null;
  const result = extractMemDialogue(fs, { sessionId: sid, filter: f, phase, grep });
  for (const w of result.warnings) deps.io.err(`warning: ${w.message}`);
  const s = result.session;
  if (p.flags.json) {
    deps.io.out(
      JSON.stringify(
        {
          session: s,
          phase: result.phase,
          windows: result.windows,
          total_turns: result.totalTurns,
          groups: result.groups,
          turns: result.turns
        },
        null,
        2
      )
    );
    return 0;
  }
  deps.io.out(`# session: [${s.platform}] ${s.id}`);
  if (s.title) deps.io.out(`# title: ${s.title}`);
  if (s.cwd) deps.io.out(`# cwd:   ${shortPath(fs, s.cwd)}`);
  if (s.created) deps.io.out(`# date:  ${shortDate(s.created)}`);
  let line = `# phase: ${result.phase}  turns: ${result.turns.length}/${result.totalTurns}`;
  if (grep) line += ` (filtered by /${grep}/)`;
  if (result.windows.length > 0) line += `  windows: ${result.windows.length}`;
  deps.io.out(line);
  deps.io.out("");
  for (const g of result.groups) {
    if (g.label !== null) deps.io.out(`--- task: ${g.label} ---
`);
    for (const t of g.turns) {
      deps.io.out(`## ${t.role === "user" ? "Human" : "Assistant"}
`);
      deps.io.out(t.text);
      deps.io.out("\n---\n");
    }
  }
  return 0;
}
function cmdHelp(deps) {
  deps.io.out(`pipeline mem \u2014 list/search Claude/Codex/OpenCode/Pi sessions

commands:
  list                          list sessions (default if no command)
  search <keyword>              find sessions whose contents match keyword
  context <session-id>          drill-down: top-N hit turns + surrounding context
  extract <session-id>          dump cleaned dialogue (use --grep KW to filter turns)
  projects                      list active projects (cwds) with session counts

flags:
  --platform claude|codex|opencode|pi|all   default all
  --since YYYY-MM-DD / --until YYYY-MM-DD    inclusive bounds
  --global                                   include all projects (default: cwd-scoped)
  --cwd <path>                               override the project cwd
  --limit N                                  cap output (default 50; projects 30)
  --grep KW                                  extract / context: filter turns by keyword
  --phase brainstorm|implement|all           extract: slice by pipeline brainstorm windows
  --turns N / --around N / --max-chars N      context: window + budget
  --include-children                         search / context: merge sub-agent sessions
  --json                                     emit JSON`);
}
async function cmdMem(deps, sub, args, fs = nodeMemFs()) {
  const p = splitFlags(args);
  if (p.flags.help || p.flags.h || sub === "help" || sub === "--help") {
    cmdHelp(deps);
    return 0;
  }
  const cmd = sub || "list";
  try {
    switch (cmd) {
      case "list":
        return cmdList3(deps, p, fs);
      case "search":
        return cmdSearch(deps, p, fs);
      case "context":
        return cmdContext2(deps, p, fs);
      case "extract":
        return cmdExtract(deps, p, fs);
      case "projects":
        return cmdProjects(deps, p, fs);
      default:
        die2(`unknown command: ${cmd} (try 'help')`);
    }
  } catch (e) {
    if (e instanceof MemDie) {
      deps.io.err(`error: ${e.message}`);
      return 2;
    }
    if (e instanceof MemSessionNotFoundError) {
      deps.io.err(`error: session not found: ${e.sessionId}`);
      return 2;
    }
    throw e;
  }
}

// packages/cli/src/commands/scaffold.ts
import { mkdir as mkdir9, readFile as readFile5, rm as rm3, stat as stat7, writeFile as writeFile8 } from "node:fs/promises";
import { dirname as dirname8, join as join32 } from "node:path";
var REAL_FS = {
  exists: async (abs) => {
    try {
      await stat7(abs);
      return true;
    } catch {
      return false;
    }
  },
  readText: async (abs) => {
    try {
      return await readFile5(abs, "utf8");
    } catch {
      return void 0;
    }
  },
  writeText: async (abs, content) => {
    await mkdir9(dirname8(abs), { recursive: true });
    await writeFile8(abs, content, "utf8");
  },
  rmrf: async (abs) => {
    await rm3(abs, { recursive: true, force: true }).catch(() => {
    });
  },
  env: (name2) => process.env[name2]
};
var SPEC_STRATEGY_SIGNAL = "PIPELINE_SPEC_STRATEGY";
function conflictGuidance(deps, specDir) {
  deps.io.err(`[SPEC-CONFLICT] ${specDir} \u5DF2\u5B58\u5728\u6587\u4EF6\u2014\u2014\u9700\u9009\u62E9\u6A21\u677F\u7B56\u7565\uFF08\u7F3A\u7701\u51B2\u7A81\uFF0C\u672A\u5F39\u4EA4\u4E92 picker\uFF09\uFF1A`);
  deps.io.err("  skip      \u2014\u2014 \u5B58\u5728\u5219\u6574\u4F53\u4E0D\u52A8\uFF0C\u4FDD\u7559\u4F60\u7684\u65E2\u6709\u6587\u6863");
  deps.io.err("  overwrite \u2014\u2014 \u5148\u5220\u73B0\u5B58\u518D\u5168\u91CF\u91CD\u94FA\uFF08\u4E22\u5F03\u65E2\u6709\uFF09");
  deps.io.err("  append    \u2014\u2014 \u53EA\u8865\u7F3A\u5931\u6587\u4EF6\uFF0C\u4FDD\u7559\u65E2\u6709");
  deps.io.err(`  \u4F20\u53C2\u51B3\u7B56\uFF1A--strategy <skip|overwrite|append>  \u6216  ${SPEC_STRATEGY_SIGNAL}=<...>\uFF08\u4E0A\u5C42 AskUserQuestion \u540E\u6CE8\u5165\uFF09`);
}
async function cmdScaffoldSpec(deps, args, fs) {
  const { positional: positionals2, flags } = splitFlags(args);
  const type = positionals2[0];
  if (type === void 0 || !isProjectType(type)) {
    deps.io.err(`ERROR: \u975E\u6CD5 project type '${type ?? ""}'\uFF0C\u5141\u8BB8: ${PROJECT_TYPES.join(" | ")}`);
    return 1;
  }
  const specDir = typeof flags["spec-dir"] === "string" && flags["spec-dir"] !== "" ? flags["spec-dir"] : DEFAULT_SPEC_DIR;
  const rawStrategy = typeof flags["strategy"] === "string" && flags["strategy"] !== "" ? flags["strategy"] : fs.env(SPEC_STRATEGY_SIGNAL) || "";
  const files = buildSpecScaffold(type, specDir);
  const abs = (rel) => join32(deps.cwd, rel);
  const existing = /* @__PURE__ */ new Set();
  for (const f of files) {
    if (await fs.exists(abs(f.rel))) existing.add(f.rel);
  }
  let strategy;
  if (rawStrategy === "") {
    if (existing.size > 0) {
      conflictGuidance(deps, specDir);
      return 2;
    }
    strategy = "skip";
  } else {
    if (!isDocStrategy(rawStrategy)) {
      deps.io.err(`ERROR: \u975E\u6CD5 strategy '${rawStrategy}'\uFF0C\u5141\u8BB8: ${DOC_STRATEGIES.join(" | ")}`);
      return 1;
    }
    strategy = rawStrategy;
  }
  const plan = planDocScaffold(files, existing, strategy);
  try {
    for (const rel of plan.removes) await fs.rmrf(abs(rel));
    for (const f of plan.writes) await fs.writeText(abs(f.rel), f.content);
  } catch (e) {
    deps.io.err(`ERROR: scaffold \u5199\u76D8\u5931\u8D25: ${errMsg(e)}`);
    return 1;
  }
  if (plan.skippedAll) {
    deps.io.err(`[SCAFFOLD] skip\uFF1A${specDir} \u5DF2\u6709\u6587\u6863\uFF0C\u4FDD\u7559 ${plan.skipped.length} \u9879\u3001\u672A\u5199\u5165\uFF08strategy=skip\uFF09`);
    return 0;
  }
  for (const f of plan.writes) deps.io.out(f.rel);
  deps.io.err(
    `[SCAFFOLD] ${type}\uFF1A\u5199\u5165 ${plan.writes.length} \u9879` + (plan.removes.length ? `\uFF08\u8986\u76D6\u5220 ${plan.removes.length}\uFF09` : "") + (plan.skipped.length ? `\uFF0C\u4FDD\u7559\u65E2\u6709 ${plan.skipped.length}` : "") + `\uFF08strategy=${strategy}, spec-dir=${specDir}\uFF09`
  );
  return 0;
}
async function cmdResolveWorkflow(deps, args, fs) {
  const { positional: positionals2, flags } = splitFlags(args);
  const requested = positionals2[0];
  const abs = (rel) => join32(deps.cwd, rel);
  let available = [];
  const sourceIdx = typeof flags["source-index"] === "string" ? flags["source-index"] : void 0;
  if (sourceIdx) {
    const text = await fs.readText(abs(sourceIdx));
    if (text === void 0) {
      deps.io.err(`ERROR: source index \u4E0D\u5B58\u5728: ${sourceIdx}`);
      return 1;
    }
    available = parseWorkflowIds(text);
  }
  let res = resolveWorkflow(requested, available);
  if (!res.ok) {
    if ("fallback-native" in flags) {
      deps.io.err(`[WORKFLOW] ${res.error} \u2192 \u964D\u7EA7 native\uFF08--fallback-native\uFF09`);
      res = resolveWorkflow("native", available);
    } else {
      deps.io.err(`ERROR: ${res.error}`);
      return 1;
    }
  }
  if (!res.ok) {
    deps.io.err(`ERROR: ${res.error}`);
    return 1;
  }
  const action = workflowHashAction(res.isNative);
  deps.io.out(`id=${res.id}`);
  deps.io.out(`native=${res.isNative}`);
  deps.io.out(`source=${res.source}`);
  deps.io.out(`hash-contract=${action}`);
  if ("marker" in flags && !res.isNative) {
    try {
      await fs.writeText(abs(WORKFLOW_SOURCE_MARKER), workflowSourceMarkerContent(res.id, sourceIdx, deps.clock()));
      deps.io.err(`[WORKFLOW] \u5199\u6765\u6E90 marker ${WORKFLOW_SOURCE_MARKER}\uFF08id=${res.id}\uFF09`);
    } catch (e) {
      deps.io.err(`[WORKFLOW] marker \u5199\u5165\u5931\u8D25\uFF08degraded\uFF09: ${errMsg(e)}`);
    }
  }
  if ("apply-hash" in flags) {
    try {
      const manifestAbs = abs(OWNED_MANIFEST);
      const text = await fs.readText(manifestAbs);
      const map = text === void 0 ? {} : parseOwnedManifest(text);
      const workflowContent = res.isNative ? await fs.readText(abs(WORKFLOW_MD_REL)) : void 0;
      const next = applyWorkflowHashContract(map, WORKFLOW_MD_REL, res.isNative, workflowContent);
      await fs.writeText(manifestAbs, serializeOwnedManifest(next));
      deps.io.err(`[WORKFLOW] hash \u5951\u7EA6\u5DF2\u843D\u76D8\uFF08${action} ${WORKFLOW_MD_REL} in ${OWNED_MANIFEST}\uFF09`);
    } catch (e) {
      deps.io.err(`[WORKFLOW] hash \u5951\u7EA6\u843D\u76D8\u5931\u8D25\uFF08degraded\uFF09: ${errMsg(e)}`);
    }
  }
  return 0;
}
async function cmdScaffold(deps, sub, args, fs = REAL_FS) {
  switch (sub) {
    case "scaffold":
    case "spec":
      return cmdScaffoldSpec(deps, args, fs);
    case "resolve-workflow":
      return cmdResolveWorkflow(deps, args, fs);
    default:
      deps.io.err(`ERROR: \u672A\u77E5 scaffold \u5B50\u547D\u4EE4: ${sub}\uFF08\u652F\u6301: scaffold resolve-workflow\uFF09`);
      return 1;
  }
}

// packages/cli/src/commands/session.ts
import { readFile as readFile6, writeFile as writeFile9 } from "node:fs/promises";
import { join as join33 } from "node:path";
var ACTIVE_POINTER_FILE = ".pipeline-active";
var PROJECT_CONFIG_FILE = ".pipeline-project.yaml";
var REAL_FS2 = {
  loadPackages: async (cwd) => {
    let text;
    try {
      text = await readFile6(join33(cwd, PROJECT_CONFIG_FILE), "utf8");
    } catch {
      return null;
    }
    try {
      return parseProjectPackages(text);
    } catch {
      return null;
    }
  },
  bindPointer: async (cwd, name2) => {
    await writeFile9(join33(cwd, ACTIVE_POINTER_FILE), `${name2}
`, "utf8");
  }
};
function checkName2(deps, name2) {
  const v = validateChangeName(name2);
  if (v.ok) return true;
  deps.io.err(v.error);
  return false;
}
async function ensureState(deps, name2) {
  const dir = changeDir(deps.cwd, name2);
  try {
    await deps.store.read(dir);
    return dir;
  } catch {
    deps.io.err(`ERROR: \u72B6\u6001\u6587\u4EF6\u4E0D\u5B58\u5728: openspec/changes/${name2}/.pipeline.yaml`);
    deps.io.err(`  \u5148\u6267\u884C: pipeline init ${name2} --track <track> --preset <preset>`);
    return null;
  }
}
async function cmdActivate(deps, name2, fs) {
  if (!checkName2(deps, name2)) return 1;
  if (await ensureState(deps, name2) === null) return 1;
  try {
    await fs.bindPointer(deps.cwd, name2);
  } catch (e) {
    deps.io.err(`[activate] \u6D3B\u8DC3\u6307\u9488\u5199\u5165\u5931\u8D25 \u2192 degraded\uFF08\u56DE\u9000\u5BF9\u8BDD\u4E0A\u4E0B\u6587\uFF09\uFF0C\u672A\u843D session \u6307\u9488: ${errMsg(e)}`);
    return 0;
  }
  deps.io.err(`[OK] activate ${name2}\uFF08\u672C session \u6D3B\u8DC3\u6307\u9488\u5DF2\u7ED1\u5B9A .pipeline-active\uFF1Bphase/phase_status \u672A\u6539\u52A8\uFF09`);
  return 0;
}
async function cmdRouteContext(deps, args, fs) {
  const name2 = args[0];
  const json = args.includes("--json");
  if (!checkName2(deps, name2)) return 1;
  const dir = await ensureState(deps, name2);
  if (dir === null) return 1;
  let related;
  try {
    const state = await deps.store.read(dir);
    related = relatedFilesFromField(state.fields.related_files);
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`);
    return 1;
  }
  const packages = await fs.loadPackages(deps.cwd);
  const obj = routeBucketsToObject(routeContext(related, packages));
  if (json) {
    deps.io.out(JSON.stringify(obj));
    return 0;
  }
  for (const line of renderRouteContextText(name2, obj)) deps.io.out(line);
  return 0;
}
async function cmdSession(deps, sub, args, fs = REAL_FS2) {
  switch (sub) {
    case "activate":
      return cmdActivate(deps, args[0], fs);
    case "route-context":
      return cmdRouteContext(deps, args, fs);
    default:
      deps.io.err(`ERROR: \u672A\u77E5 session \u5B50\u547D\u4EE4: ${sub}\uFF08\u652F\u6301: activate route-context\uFF09`);
      return 1;
  }
}

// packages/cli/src/commands/setup.ts
import { execFileSync } from "node:child_process";
import { chmodSync as chmodSync2, lstatSync, mkdirSync as mkdirSync7, readdirSync as readdirSync5, readSync as readSync2, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { homedir as homedir7 } from "node:os";
import { join as join34, resolve as resolve9 } from "node:path";
var REAL_SETUP_ENV = {
  homeDir: () => homedir7(),
  pluginRoot: () => {
    const r = process.env.CLAUDE_PLUGIN_ROOT;
    return r !== void 0 && r.trim() !== "" ? r : null;
  },
  selfPath: () => resolve9(process.argv[1] ?? ""),
  mkdirp: (dir) => {
    mkdirSync7(dir, { recursive: true });
  },
  readSymlink: (path6) => {
    try {
      return readlinkSync(path6);
    } catch {
      return null;
    }
  },
  pathExists: (path6) => {
    try {
      lstatSync(path6);
      return true;
    } catch {
      return false;
    }
  },
  listDir: (dir) => {
    try {
      return readdirSync5(dir, { withFileTypes: true }).filter((e) => e.isDirectory() || e.isSymbolicLink()).map((e) => e.name);
    } catch {
      return [];
    }
  },
  makeSymlink: (target, linkPath) => {
    symlinkSync(target, linkPath);
  },
  removePath: (path6) => {
    unlinkSync(path6);
  },
  chmodExec: (path6) => {
    chmodSync2(path6, 493);
  },
  runCommand: (cmd, args) => {
    try {
      const stdout = execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      return { code: 0, stdout, stderr: "" };
    } catch (e) {
      const err = e;
      return {
        code: typeof err.status === "number" ? err.status : 1,
        stdout: err.stdout != null ? String(err.stdout) : "",
        stderr: err.stderr != null ? String(err.stderr) : errMsg(e)
      };
    }
  },
  confirm: (question) => {
    process.stdout.write(question);
    try {
      const buf = Buffer.alloc(64);
      const n = readSync2(0, buf, 0, 64, null);
      const ans = buf.toString("utf8", 0, n).trim().toLowerCase();
      return ans === "y" || ans === "yes";
    } catch {
      return false;
    }
  }
};
function resolvePipelineSource(env) {
  const root = env.pluginRoot();
  if (root !== null) return join34(root, "packages", "cli", "dist", "pipeline.mjs");
  return env.selfPath();
}
function ensurePipelineOnPath(deps, env = REAL_SETUP_ENV) {
  try {
    const source = resolvePipelineSource(env);
    const binDir = join34(env.homeDir(), ".local", "bin");
    const link = join34(binDir, "pipeline");
    env.mkdirp(binDir);
    const existing = env.readSymlink(link);
    if (existing === source) {
      chmodExecBestEffort(env, source);
      deps.io.out(`[setup] pipeline \u5DF2\u5728 PATH:${link} \u2192 ${source}\uFF08\u540C\u6E90,\u8DF3\u8FC7\uFF09`);
      return;
    }
    if (existing !== null) {
      deps.io.err(`WARN: ${link} \u539F\u6307\u5411 ${existing},\u672C\u6B21\u8986\u76D6\u4E3A ${source}\uFF08\u672C\u6B21\u5B89\u88C5\u7684 bundle\uFF09\u3002`);
      env.removePath(link);
    } else if (env.pathExists(link)) {
      deps.io.err(`WARN: ${link} \u5DF2\u5B58\u5728\u4E14\u975E\u8F6F\u94FE,\u672C\u6B21\u8986\u76D6\u4E3A\u6307\u5411 ${source} \u7684\u8F6F\u94FE\u3002`);
      env.removePath(link);
    }
    env.makeSymlink(source, link);
    chmodExecBestEffort(env, source);
    deps.io.out(`[setup] \u5DF2\u628A pipeline \u8F6F\u94FE\u5230 PATH:${link} \u2192 ${source}`);
    deps.io.out('  \u82E5\u7EC8\u7AEF\u4ECD\u627E\u4E0D\u5230 pipeline,\u8BF7\u786E\u8BA4 ~/.local/bin \u5728 $PATH\uFF08\u5982 export PATH="$HOME/.local/bin:$PATH"\uFF09\u3002');
  } catch (e) {
    deps.io.err(`WARN: \u8F6F\u94FE pipeline \u5230 PATH \u5931\u8D25\uFF08\u4E0D\u5F71\u54CD\u5176\u4F59\u5B89\u88C5\u6B65\u9AA4,\u53EF\u624B\u52A8\u8F6F\u94FE\uFF09:${errMsg(e)}`);
  }
}
function chmodExecBestEffort(env, source) {
  try {
    env.chmodExec(source);
  } catch {
  }
}
function printPlanSkeleton(deps, opts) {
  deps.io.out("[setup] \u5168\u529F\u80FD\u5C31\u7EEA\u5F15\u5BFC \u2014\u2014 \u8BA1\u5212\u9AA8\u67B6");
  deps.io.out("  1. PATH \u8F6F\u94FE:\u628A pipeline \u8F6F\u94FE\u5230 ~/.local/bin\uFF08\u672C\u6279\u5DF2\u5B9E\u73B0\uFF09");
  deps.io.out("  2. \u6280\u80FD\u5B89\u88C5\uFF08Phase 2,\u672C\u6279\u5DF2\u5B9E\u88C5\uFF09:\u8BFB registry \u6309 tool \u5206\u7EC4\u9009\u88C5\uFF08\u8BE6\u89C1\u4E0B\u65B9\u6280\u80FD\u8BA1\u5212\uFF09");
  deps.io.out("  3. \u8FD0\u884C\u65F6\u68C0\u67E5\uFF08Phase 3,\u5DF2\u5B9E\u88C5\uFF09:docker/\u955C\u50CF/\u4E24 runner \u51ED\u8BC1\u5C31\u7EEA\u6E05\u5355 + \u7F3A\u955C\u50CF\u4E00\u952E\u6784\u5EFA\uFF08\u672C\u6D41\u7A0B\u672B\u5C3E\u76F4\u63A5\u8DD1;--dry-run \u53EA\u63D0\u793A\u89C1 pipeline setup runtime\uFF09");
  deps.io.out("  4. \u5168\u529F\u80FD\u5C31\u7EEA\u6E05\u5355\uFF08\u5F85\u805A\u5408\uFF09:\u9010\u9879\u5728\u4F4D/\u964D\u7EA7 \u7EA2\u9EC4\u7EFF\u6C47\u603B");
  if (opts.dryRun) deps.io.out("  \uFF08--dry-run:\u4EC5\u6253\u5370\u8BA1\u5212,\u672A\u8F6F\u94FE\u3001\u672A\u5199\u4EFB\u4F55\u6587\u4EF6\uFF09");
}
var REGISTERED_MARKETPLACES = /* @__PURE__ */ new Set(["claude-plugins-official"]);
var TIER_RANK = { mandatory: 3, recommended: 2, conditional: 1, optional: 0 };
var higherTier = (a, b) => TIER_RANK[a] >= TIER_RANK[b] ? a : b;
function marketplaceRepo(source) {
  return source.includes("/") ? source : `${source}/skills`;
}
function skillInstalled(env, name2) {
  const home = env.homeDir();
  if (env.pathExists(join34(home, ".claude", "skills", name2))) return true;
  if (env.pathExists(join34(home, ".agents", "skills", name2))) return true;
  const cache2 = join34(home, ".claude", "plugins", "cache");
  for (const marketplace of env.listDir(cache2)) {
    if (env.pathExists(join34(cache2, marketplace, name2))) return true;
  }
  return false;
}
function cmdStr(c) {
  return [c.cmd, ...c.args].join(" ");
}
function buildSkillsPlan(sources, env) {
  const alreadyInstalled = [];
  const noInstall = [];
  const marketplaceAdds = /* @__PURE__ */ new Map();
  const pluginCmds = /* @__PURE__ */ new Map();
  const skillsBySource = /* @__PURE__ */ new Map();
  const npmCmds = /* @__PURE__ */ new Map();
  const ensureMarketplace = (source, official) => {
    if (official || REGISTERED_MARKETPLACES.has(source)) return;
    const repo = marketplaceRepo(source);
    if (marketplaceAdds.has(repo)) return;
    marketplaceAdds.set(repo, {
      group: "marketplace-add",
      cmd: "claude",
      args: ["plugin", "marketplace", "add", repo],
      tokens: [],
      names: [],
      bareAdd: false,
      source,
      official: false,
      tier: "optional",
      globalDir: "~/.claude",
      note: "\u975E\u5B98\u65B9 marketplace"
    });
  };
  const addPlugin = (id, source, official, tier, tokenLabel, engineNote) => {
    if (skillInstalled(env, id)) {
      alreadyInstalled.push({ token: tokenLabel, where: `~/.claude/plugins/cache/${id}` });
      return;
    }
    ensureMarketplace(source, official);
    const key = `${id}@${source}`;
    const existing = pluginCmds.get(key);
    if (existing) {
      existing.tokens.push(tokenLabel);
      existing.tier = higherTier(existing.tier, tier);
      if (engineNote) existing.note = existing.note ? `${existing.note}\uFF1B${engineNote}` : engineNote;
      return;
    }
    pluginCmds.set(key, {
      group: "claude-plugin",
      cmd: "claude",
      args: ["plugin", "install", key],
      tokens: [tokenLabel],
      names: [],
      bareAdd: false,
      source,
      official,
      tier,
      globalDir: "~/.claude",
      note: engineNote
    });
  };
  for (const s of sources) {
    if (s.tool === "builtin" || s.tool === "bundled") {
      noInstall.push({ token: s.token, tool: s.tool });
      continue;
    }
    if (s.tool === "claude-plugin") {
      if (s.note?.includes("\u5DF2\u88C5")) {
        alreadyInstalled.push({ token: s.token, where: "\u672C\u673A\u901A\u5E38\u5DF2\u88C5\uFF08registry note \u6807\u6CE8\uFF09" });
        continue;
      }
      addPlugin(s.skill ?? s.token, s.source, s.official, s.tier, s.token);
      continue;
    }
    if (s.tool === "skills-cli") {
      const g = skillsBySource.get(s.source) ?? [];
      g.push(s);
      skillsBySource.set(s.source, g);
      continue;
    }
    if (s.tool === "npm") {
      const existing = npmCmds.get(s.source);
      if (existing) {
        existing.tokens.push(s.token);
        existing.tier = higherTier(existing.tier, s.tier);
        continue;
      }
      npmCmds.set(s.source, {
        group: "npm",
        cmd: "npm",
        args: ["install", "-g", s.source],
        tokens: [s.token],
        names: [],
        bareAdd: false,
        source: s.source,
        official: s.official,
        tier: s.tier,
        globalDir: "\u5168\u5C40 npm\uFF08npm root -g\uFF09"
      });
    }
  }
  for (const s of sources) {
    if (!s.engine) continue;
    const at = s.engine.lastIndexOf("@");
    if (at <= 0) continue;
    addPlugin(
      s.engine.slice(0, at),
      s.engine.slice(at + 1),
      REGISTERED_MARKETPLACES.has(s.engine.slice(at + 1)),
      s.tier,
      `${s.engine.slice(0, at)}(\u5F15\u64CE)`,
      `\u9644\u52A0 MCP \u5F15\u64CE(${s.token} \u9700\u8981)`
    );
  }
  const skillsCliCmds = [];
  for (const [source, group] of skillsBySource) {
    const bareAdd = group.length === 1 && group[0].skill === void 0;
    const toInstall = [];
    for (const t of group) {
      if (skillInstalled(env, t.skill ?? t.token)) alreadyInstalled.push({ token: t.token, where: "~/.agents/skills \u6216 ~/.claude/skills" });
      else toInstall.push(t);
    }
    if (toInstall.length === 0) continue;
    let tier = "optional";
    for (const t of toInstall) tier = higherTier(tier, t.tier);
    if (bareAdd) {
      skillsCliCmds.push({
        group: "skills-cli",
        cmd: "npx",
        args: ["skills", "add", source],
        tokens: toInstall.map((t) => t.token),
        names: [],
        bareAdd: true,
        source,
        official: group[0].official,
        tier,
        globalDir: "~/.agents/skills"
      });
    } else {
      const names = toInstall.map((t) => t.skill ?? t.token);
      skillsCliCmds.push({
        group: "skills-cli",
        cmd: "npx",
        args: ["skills", "add", source, ...names.flatMap((n) => ["--skill", n])],
        tokens: toInstall.map((t) => t.token),
        names,
        bareAdd: false,
        source,
        official: group[0].official,
        tier,
        globalDir: "~/.agents/skills",
        listCmd: { cmd: "npx", args: ["skills", "add", source, "--list"] }
      });
    }
  }
  const commands = [...marketplaceAdds.values(), ...pluginCmds.values(), ...skillsCliCmds, ...npmCmds.values()];
  return { commands, alreadyInstalled, noInstall };
}
function renderSkillsPlan(deps, plan) {
  const dirs = [...new Set(plan.commands.map((c) => c.globalDir))];
  deps.io.out(
    `[setup skills] \u6280\u80FD\u5B89\u88C5\u8BA1\u5212 \u2014\u2014 \u5F85\u88C5 ${plan.commands.length} \u6761\u547D\u4EE4 / \u5DF2\u88C5\u8DF3\u8FC7 ${plan.alreadyInstalled.length} / \u5185\u7F6E\xB7\u672C\u4ED3\u81EA\u5E26 ${plan.noInstall.length}\uFF08\u65E0\u9700\u5B89\u88C5\uFF09`
  );
  if (dirs.length > 0) deps.io.out(`  \u53D7\u5F71\u54CD\u5168\u5C40\u76EE\u5F55:${dirs.join("\u3001")}`);
  const sections = [
    ["marketplace-add", "claude \u63D2\u4EF6 \xB7 marketplace add\uFF08\u975E\u5B98\u65B9\u6E90\u9700\u5148\u6DFB\u52A0\uFF09"],
    ["claude-plugin", "claude \u63D2\u4EF6\u5B89\u88C5"],
    ["skills-cli", "skills CLI \xB7 \u6309\u540D\u9009\u88C5\uFF08\u7981\u6574\u88C5\uFF09"],
    ["npm", "npm \u5168\u5C40"]
  ];
  for (const [g, title] of sections) {
    const cs = plan.commands.filter((c) => c.group === g);
    if (cs.length === 0) continue;
    deps.io.out(`  \u2500\u2500 ${title} \u2500\u2500`);
    for (const c of cs) {
      const tag2 = c.official ? "[\u5B98\u65B9]" : "[\u7B2C\u4E09\u65B9]";
      deps.io.out(`   ${cmdStr(c)}   ${tag2} \u2192 ${c.globalDir}${c.note ? `  \uFF08${c.note}\uFF09` : ""}`);
      if (c.group === "skills-cli" && !c.bareAdd) deps.io.out(`      \u6280\u80FD(${c.names.length}):${c.names.join(", ")}`);
      else if (c.tokens.length > 0) deps.io.out(`      token:${c.tokens.join(", ")}`);
    }
  }
  if (plan.alreadyInstalled.length > 0) {
    deps.io.out(`  \u5DF2\u88C5\xB7\u8DF3\u8FC7\uFF08${plan.alreadyInstalled.length}\uFF09:${plan.alreadyInstalled.map((a) => a.token).join(", ")}`);
  }
}
function executeSkillsPlan(deps, plan, env) {
  const out = { successes: [], failures: [], drifts: [] };
  for (const c of plan.commands) {
    if (c.listCmd) {
      try {
        const r = env.runCommand(c.listCmd.cmd, c.listCmd.args);
        if (r.code === 0) {
          for (const n of c.names) if (!r.stdout.includes(n)) out.drifts.push({ source: c.source, name: n });
        }
      } catch {
      }
    }
    deps.io.out(`[setup skills] $ ${cmdStr(c)}`);
    try {
      const r = env.runCommand(c.cmd, c.args);
      if (r.stdout.trim() !== "") deps.io.out(r.stdout.trimEnd());
      if (r.code === 0) out.successes.push(c);
      else out.failures.push({ cmd: c, detail: r.stderr.trim() !== "" ? r.stderr.trim() : `\u9000\u51FA\u7801 ${r.code}` });
    } catch (e) {
      out.failures.push({ cmd: c, detail: errMsg(e) });
    }
  }
  return out;
}
function renderSummary(deps, o, plan) {
  deps.io.out(
    `[setup skills] \u5B8C\u6210 \u2014\u2014 \u6210\u529F ${o.successes.length} / \u8DF3\u8FC7 ${plan.alreadyInstalled.length} / \u5931\u8D25 ${o.failures.length}`
  );
  for (const d of o.drifts) {
    deps.io.out(
      `  [WARN] \u540D\u79F0\u6F02\u79FB:${d.source} \u7684 '${d.name}' \u5728 --list \u672A\u547D\u4E2D\uFF08\u4E0A\u6E38\u53EF\u80FD\u5DF2\u6539\u540D\u2014\u2014\u88C5\u6700\u65B0\u8BED\u4E49;\u53EF\u7528 find-skills \u91CD\u65B0\u5B9A\u4F4D\uFF09`
    );
  }
  let mandatoryFail = false;
  for (const f of o.failures) {
    const s = cmdStr(f.cmd);
    if (f.cmd.tier === "mandatory") {
      mandatoryFail = true;
      deps.io.err(`  [FAIL\xB7\u5F3A\u5236] ${s} \u2014\u2014 ${f.detail}`);
      deps.io.err(`             \u624B\u52A8\u91CD\u8BD5:${s}`);
    } else {
      deps.io.err(`  [FAIL] ${s} \u2014\u2014 ${f.detail}\uFF08${f.cmd.tier};\u975E\u5F3A\u5236,\u4E0D\u963B\u65AD\u9000\u51FA\u7801\uFF09`);
    }
  }
  if (o.failures.length === 0) deps.io.out("  \u5168\u90E8\u547D\u4EE4\u6267\u884C\u6210\u529F\u3002");
  return mandatoryFail ? 1 : 0;
}
function cmdSetupSkills(deps, opts, env = REAL_SETUP_ENV, sources, loadSources = loadSkillSources) {
  let list;
  if (sources !== void 0) {
    list = sources;
  } else {
    const loaded = loadSources();
    if (!loaded.ok) {
      deps.io.err(
        `ERROR: \u6280\u80FD registry \u672A\u5C31\u7EEA\uFF08${loaded.error}\uFF09\u2014\u2014\u65E0\u6CD5\u751F\u6210\u5B89\u88C5\u8BA1\u5212\uFF0C\u8BF7\u4FEE\u590D templates/skill-sources.yaml \u540E\u91CD\u8BD5 pipeline setup skills\u3002`
      );
      return 1;
    }
    list = loaded.sources;
  }
  const plan = buildSkillsPlan(list, env);
  renderSkillsPlan(deps, plan);
  if (opts.dryRun) {
    deps.io.out("[setup skills] --dry-run:\u4EC5\u6253\u5370\u8BA1\u5212,\u672A\u6267\u884C\u4EFB\u4F55\u547D\u4EE4\u3001\u672A\u5199\u4EFB\u4F55\u5168\u5C40\u76EE\u5F55\u3002");
    return 0;
  }
  if (plan.commands.length === 0) {
    deps.io.out("[setup skills] \u65E0\u5F85\u88C5\u6280\u80FD\uFF08\u5168\u90E8\u5DF2\u5C31\u7EEA\u6216\u65E0\u53EF\u5B89\u88C5\u9879\uFF09\u3002");
    return 0;
  }
  if (!opts.yes) {
    const dirs = [...new Set(plan.commands.map((c) => c.globalDir))].join(" / ");
    if (!env.confirm(`[setup skills] \u5C06\u6267\u884C ${plan.commands.length} \u6761\u547D\u4EE4,\u5199\u5165\u5168\u5C40\u76EE\u5F55:${dirs}\u3002\u786E\u8BA4?(y/N) `)) {
      deps.io.out("[setup skills] \u5DF2\u53D6\u6D88\uFF08\u672A\u6267\u884C\u4EFB\u4F55\u547D\u4EE4\uFF09\u3002");
      return 0;
    }
  }
  return renderSummary(deps, executeSkillsPlan(deps, plan, env), plan);
}
var REAL_RUNTIME_ENV = {
  exec: nodeExecDocker,
  hostEnv: process.env,
  resolveImage: (cwd) => readAutomationJson(cwd).image ?? "sandcastle:local"
};
var READY_TAG = "[\u5C31\u7EEA]";
var MISS_TAG = "[\u7F3A\u5931]";
function credSource(light) {
  return `\u5DF2\u914D\uFF08${light.source === "host-env" ? "\u5BBF\u4E3B env" : "secrets \u6587\u4EF6"}\uFF09`;
}
var HINT_INDENT = "         ";
function emitCredLine(deps, runner, key, light, required, note = "", acquireHint = "") {
  if (light.set) {
    deps.io.out(`  ${READY_TAG} ${runner} \u51ED\u8BC1 ${key} ${credSource(light)}`);
  } else if (required) {
    deps.io.out(`  ${MISS_TAG} ${runner} \u51ED\u8BC1 ${key} \u672A\u914D \u2192 \u53BB\u914D ${key}\uFF08pipeline \u673A\u5668\u7EA7 secrets \u6216\u5BBF\u4E3B env\uFF09`);
    if (acquireHint !== "") deps.io.out(`${HINT_INDENT}\u600E\u4E48\u62FF\uFF1A${acquireHint}`);
  } else {
    deps.io.out(`  ${MISS_TAG} ${runner} ${key} \u672A\u914D${note}`);
  }
}
function renderRuntimeReadiness(deps, r, dryRun) {
  deps.io.out("[setup runtime] AFK \u8FD0\u884C\u65F6\u5C31\u7EEA\u6E05\u5355\uFF08\u7EC8\u7AEF doctor/setup \u4E3A\u51ED\u8BC1\u6743\u5A01\u2014\u2014\u5373\u5C06 afk run \u7684 shell \u5F53\u523B\u771F\u503C\uFF09");
  if (r.docker.available) deps.io.out(`  ${READY_TAG} docker daemon \u53EF\u7528`);
  else {
    deps.io.out(`  ${MISS_TAG} docker \u4E0D\u53EF\u7528\u2014\u2014AFK \u5BB9\u5668\u6267\u884C\u964D\u7EA7\uFF08AFK \u4E3A\u53EF\u9009\u80FD\u529B;\u88C5 docker \u5E76\u8D77 daemon \u540E\u91CD\u63A2\uFF09`);
    deps.io.out(`${HINT_INDENT}\u600E\u4E48\u62FF\uFF1A${PREREQ_HINTS.docker}`);
  }
  const img = r.image;
  if (img.present) deps.io.out(`  ${READY_TAG} AFK \u955C\u50CF ${img.configured} \u5728\u4F4D`);
  else if (r.docker.available) deps.io.out(`  ${MISS_TAG} AFK \u955C\u50CF ${img.configured} \u4E0D\u5728\u672C\u673A \u2192 \u6784\u5EFA:${img.build_hint}`);
  else deps.io.out(`  ${MISS_TAG} AFK \u955C\u50CF ${img.configured} \u672A\u80FD\u6838\uFF08docker \u4E0D\u53EF\u7528\uFF09\u2192 \u8D77 docker \u540E\u91CD\u63A2;\u7F3A\u5219\u6784\u5EFA:${img.build_hint}`);
  emitCredLine(deps, "claude-code", "CLAUDE_CODE_OAUTH_TOKEN", r.credentials["claude-code"].CLAUDE_CODE_OAUTH_TOKEN, true, "", PREREQ_HINTS.claudeToken);
  emitCredLine(deps, "codex", "OPENAI_API_KEY", r.credentials.codex.OPENAI_API_KEY, true, "", PREREQ_HINTS.openaiKey);
  emitCredLine(deps, "codex", "CODEX_HOME", r.credentials.codex.CODEX_HOME, false, "\uFF08\u53EF\u9009,\u7F3A\u7701 ~/.codex\uFF09");
  if (dryRun) deps.io.out("  \uFF08--dry-run:\u53EA\u63A2\u6D4B\u53EA\u6253\u5370,\u672A\u5199\u4EFB\u4F55\u6587\u4EF6\uFF09");
}
async function cmdSetupRuntime(deps, opts, rt = REAL_RUNTIME_ENV) {
  const image = rt.resolveImage(deps.cwd);
  const secretsEnv = deps.readSecretsEnv ? await deps.readSecretsEnv().catch(() => ({})) : {};
  const readiness = await probeAfkReadiness({ image, exec: rt.exec, secretsEnv, hostEnv: rt.hostEnv });
  renderRuntimeReadiness(deps, readiness, opts.dryRun ?? false);
  return 0;
}
function cmdSetup(deps, sub, opts, env = REAL_SETUP_ENV, rt = REAL_RUNTIME_ENV) {
  const o = { dryRun: opts.dryRun ?? false, yes: opts.yes ?? false };
  switch (sub) {
    case void 0:
    case "": {
      if (!o.dryRun) ensurePipelineOnPath(deps, env);
      printPlanSkeleton(deps, o);
      const skillsCode = cmdSetupSkills(deps, o, env);
      if (o.dryRun) {
        deps.io.out(
          "[setup] \u8FD0\u884C\u65F6\u5C31\u7EEA\u68C0\u67E5:--dry-run \u8DF3\u8FC7\u771F\u63A2\u6D4B\uFF08\u4E0D\u8D77 docker\uFF09\u2014\u2014\u8DD1 pipeline setup runtime \u770B\u771F\u5B9E docker/\u955C\u50CF/\u4E24 runner \u51ED\u8BC1\u5C31\u7EEA\u6E05\u5355"
        );
        return skillsCode;
      }
      return cmdSetupRuntime(deps, o, rt).then((rtCode) => skillsCode !== 0 ? skillsCode : rtCode);
    }
    case "skills":
      return cmdSetupSkills(deps, o, env);
    case "runtime":
      return cmdSetupRuntime(deps, o, rt);
    // Promise<number>:真运行时段（docker/镜像/凭证就绪清单）
    default:
      deps.io.err(`ERROR: \u672A\u77E5 setup \u5B50\u547D\u4EE4: ${sub}\uFF08\u652F\u6301: skills runtime,\u6216\u4E0D\u5E26\u5B50\u547D\u4EE4\u8D70\u5168\u6D41\u7A0B\uFF09`);
      return 1;
  }
}

// packages/cli/src/commands/spec.ts
var REAL_FS3 = { listSpecs: listSpecEntries, inject: injectJsonl };
function checkName3(deps, name2) {
  if (name2 !== void 0 && name2 !== "" && isValidChangeName(name2)) return true;
  deps.io.err(`ERROR: change-name \u975E\u6CD5: '${name2 ?? ""}' (\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _)`);
  return false;
}
async function recordHistory2(deps, dir, entry) {
  if (!deps.history) return;
  try {
    await deps.history.append(dir, entry);
  } catch (e) {
    deps.io.err(`WARN: history \u5199\u5165\u5931\u8D25: ${errMsg(e)}`);
  }
}
function specsJson(entries) {
  const items = entries.map(
    (e) => `{"name":"${e.name}","spec_path":"${e.specPath}","has_spec":${e.hasSpec}}`
  );
  return `[${items.join(",")}]`;
}
async function cmdSpecs(deps, args, fs) {
  const json = args.includes("--json");
  const listing = await fs.listSpecs(deps.cwd);
  if (!listing.exists) {
    deps.io.out(json ? "[]" : `(\u65E0 main spec \u2014 ${listing.dir} \u4E0D\u5B58\u5728)`);
    return 0;
  }
  if (json) {
    deps.io.out(specsJson(listing.entries));
    return 0;
  }
  deps.io.out("## Main Specs\uFF08capability \u2192 spec.md\uFF09");
  if (listing.entries.length === 0) {
    deps.io.out("  (\u65E0 main spec)");
    return 0;
  }
  for (const e of listing.entries) {
    deps.io.out(`  - ${e.name.padEnd(32)} ${e.hasSpec ? e.specPath : "(\u65E0 spec.md)"}`);
  }
  return 0;
}
async function cmdSetSpecScope(deps, name2, scope) {
  if (!checkName3(deps, name2)) return 1;
  const value = specScopeWriteValue(scope);
  const dir = changeDir(deps.cwd, name2);
  try {
    await deps.store.read(dir);
    await deps.store.set(dir, "spec_scope", value);
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`);
    return 1;
  }
  await recordHistory2(deps, dir, { ts: deps.clock(), kind: "set", field: "spec_scope", to: value });
  if (value === "null") deps.io.err(`[OK] set-spec-scope ${name2}: null\uFF08\u5168\u626B\uFF0Cfail-open\uFF09`);
  else deps.io.err(`[OK] set-spec-scope ${name2}: ${value}`);
  return 0;
}
function emitContent(deps, content) {
  if (content === "") return;
  for (const line of content.replace(/\n$/, "").split("\n")) deps.io.out(line);
}
async function cmdInjectJsonl(deps, args, fs) {
  const name2 = args[0];
  const agent = args[1] ?? "implement";
  if (!checkName3(deps, name2)) return 1;
  const outcome = await fs.inject(deps.cwd, name2, agent);
  if (outcome.kind === "bad-agent") {
    deps.io.err(`Error: jsonl agent \u4EC5\u652F\u6301 implement / check\uFF08\u5F97\u5230: ${agent}\uFF09`);
    return 0;
  }
  if (outcome.kind === "missing") {
    deps.io.err(`WARN: ${outcome.jsonlPath} \u4E0D\u5B58\u5728 \u2014 sub-agent \u4EC5\u6536\u5230 task artifacts\uFF08\u65E0 curated context\uFF09`);
    return 0;
  }
  deps.io.out(`## Curated Context Manifest \xB7 ${agent} (${outcome.jsonlPath})`);
  for (const chunk of outcome.chunks) {
    deps.io.out("");
    deps.io.out(`=== ${chunk.path} ===`);
    emitContent(deps, chunk.content);
  }
  for (const w of outcome.warnings) deps.io.err(w);
  if (!outcome.sawReal) {
    deps.io.err(`WARN: ${outcome.jsonlPath} has no curated entries (only seed) \u2014 sub-agent \u4EC5\u6536 task artifacts`);
  }
  return 0;
}
async function cmdSpec(deps, sub, args, fs = REAL_FS3) {
  switch (sub) {
    case "specs":
      return cmdSpecs(deps, args, fs);
    case "set-spec-scope":
      return cmdSetSpecScope(deps, args[0], args[1]);
    case "inject-jsonl":
      return cmdInjectJsonl(deps, args, fs);
    default:
      deps.io.err(`ERROR: \u672A\u77E5 spec \u5B50\u547D\u4EE4: ${sub}\uFF08\u652F\u6301: specs set-spec-scope inject-jsonl\uFF09`);
      return 1;
  }
}

// packages/cli/src/commands/sync.ts
var STUB_MIGRATIONS = { pending: () => [], metadata: () => ({}) };
function emit2(deps, obj) {
  deps.io.out(JSON.stringify(obj));
}
async function runSync(deps, opts, fs) {
  const cwd = deps.cwd;
  const cliVersion = opts.cliVersion;
  const migrate = opts.migrate === true;
  const migrations = opts.migrations ?? STUB_MIGRATIONS;
  const projectVersion = await readVersionFile(fs, cwd);
  const guard = guardDowngrade(cliVersion, projectVersion, opts.allowDowngrade === true);
  if (!guard.proceed) {
    emit2(deps, { stage: "downgrade-guard", proceed: false, guard });
    for (const m of guard.messages) deps.io.err(m);
    return 0;
  }
  const pending = migrations.pending(projectVersion, cliVersion);
  const metadata = migrations.metadata(projectVersion, cliVersion);
  const manifest = await loadOwnedManifest(fs, cwd);
  const hasCodexDir = await fs.isDir(`${cwd.replace(/\/+$/, "")}/.codex`);
  const codexNeeded = needsCodexUpgrade(hasCodexDir, Object.keys(manifest));
  const known = codexNeeded ? [...CODEX_UPGRADE_MARKERS] : [];
  const agentsMdContent = await fs.readText(`${cwd.replace(/\/+$/, "")}/${AGENTS_MD}`);
  const { kept, pruned } = pruneOwnedManifest(manifest, { knownKeys: known, migrationPaths: pending, agentsMdContent });
  let prunedPersisted = false;
  if (pruned.length > 0 && migrate) {
    await saveOwnedManifest(fs, cwd, kept);
    prunedPersisted = true;
  }
  const injectConfig = shouldInjectConfigSections(cliVersion, projectVersion);
  const gate = migrateGateDecision(pending.length, migrate, cliVersion, projectVersion, metadata);
  emit2(deps, {
    stage: "sync",
    proceed: true,
    downgrade_action: guard.action,
    project_version: projectVersion,
    cli_version: cliVersion,
    pending_count: pending.length,
    codex_upgrade_needed: codexNeeded,
    pruned,
    pruned_persisted: prunedPersisted,
    inject_config_sections: injectConfig,
    migrate_flag: migrate,
    migrate_gate: gate,
    report_only: !migrate
  });
  for (const m of gate.messages) deps.io.err(m);
  return gate.exitCode;
}
async function runBanner(deps, opts, fs) {
  const projectVersion = await readVersionFile(fs, deps.cwd);
  const nudge = bannerNudge(projectVersion, opts.cliVersion);
  if (nudge === null) return 0;
  emit2(deps, nudge);
  return 0;
}
function runChannel(deps, opts) {
  const channel = deriveChannelFromInstalled(opts.installedJson ?? "{}", opts.pluginKey);
  emit2(deps, { channel });
  return 0;
}
async function cmdSync(deps, opts, fs = createOwnedFs()) {
  try {
    switch (opts.sub ?? "sync") {
      case "sync":
        return await runSync(deps, opts, fs);
      case "banner":
        return await runBanner(deps, opts, fs);
      case "upgrade-channel":
        return runChannel(deps, opts);
      default:
        deps.io.err(`ERROR: \u672A\u77E5 sync \u5B50\u547D\u4EE4: ${opts.sub}\uFF08\u652F\u6301: sync banner upgrade-channel\uFF09`);
        return 2;
    }
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`);
    return 2;
  }
}

// packages/cli/src/commands/tap.ts
import { spawn as spawn3 } from "node:child_process";
function parseStartArgs(own) {
  const clients = [];
  let caDir;
  let caRequested = false;
  let json = false;
  let forward = false;
  let i = 0;
  while (i < own.length) {
    const a = own[i];
    if (a === "--ca") {
      caRequested = true;
      const nxt = own[i + 1];
      if (nxt !== void 0 && !nxt.startsWith("--")) {
        caDir = nxt;
        i += 1;
      }
    } else if (a === "--json") {
      json = true;
    } else if (a === "--forward") {
      forward = true;
    } else {
      clients.push(...a.split(",").map((s) => s.trim()).filter(Boolean));
    }
    i += 1;
  }
  return { clients, caDir: caRequested ? caDir ?? "" : void 0, json, forward };
}
function envLines(clients) {
  const merged = {};
  for (const c of clients) Object.assign(merged, c.env);
  return Object.entries(merged).map(([k, v]) => `export ${k}=${JSON.stringify(v)}`);
}
async function cmdTap(deps, sub, args) {
  switch (sub) {
    case "start": {
      const command = deps.passthroughArgv ?? [];
      const { clients, caDir, json, forward } = parseStartArgs(args);
      if (clients.length === 0) {
        deps.io.err("ERROR: tap start \u9700\u81F3\u5C11\u4E00\u4E2A client\uFF08\u5982 pipeline tap start claude\uFF09");
        return 1;
      }
      let result;
      try {
        result = await launchTap({
          clients,
          store: createTraceStore(),
          ca: caDir !== void 0 ? { dir: caDir || void 0 } : void 0,
          // --forward：把列出的 client 全抬成 forward-MITM（codex OAuth 态唯一真捕获路径）。
          forceForward: forward ? clients : void 0
        });
      } catch (e) {
        deps.io.err(`ERROR: ${errMsg(e)}`);
        return 1;
      }
      if (json) {
        deps.io.out(JSON.stringify({ clients: result.clients.map(({ client, mode, port, target }) => ({ client, mode, port, target })) }));
      } else {
        for (const c of result.clients) deps.io.err(`[tap] ${c.client} (${c.mode}) \u2192 127.0.0.1:${c.port}\uFF08\u771F\u5B9E\u4E0A\u6E38 ${c.target}\uFF09`);
      }
      if (command.length > 0) {
        const merged = {};
        for (const c of result.clients) Object.assign(merged, c.env);
        const code = await new Promise((resolve10) => {
          const child = spawn3(command[0], command.slice(1), {
            stdio: "inherit",
            env: { ...process.env, ...merged }
          });
          child.on("exit", (exitCode, signal) => resolve10(exitCode ?? (signal ? 1 : 0)));
          child.on("error", () => resolve10(1));
        });
        await result.daemon.stop();
        return code;
      }
      for (const line of envLines(result.clients)) deps.io.out(line);
      await new Promise((resolve10) => {
        const stop = () => {
          void result.daemon.stop().then(resolve10);
        };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
      });
      return 0;
    }
    default:
      deps.io.err(`ERROR: \u672A\u77E5 tap \u5B50\u547D\u4EE4: ${sub}\uFF08\u652F\u6301: start <client...> [--ca [dir]] [--forward] [--json] [-- <command> ...]\uFF09`);
      return 1;
  }
}

// packages/cli/src/commands/task.ts
var REAL_FS4 = { loadTree: loadTaskTree, resolveDir: resolveChangeDir };
function checkName4(deps, name2) {
  if (name2 !== void 0 && name2 !== "" && isValidChangeName(name2)) return true;
  deps.io.err(`ERROR: change-name \u975E\u6CD5: '${name2 ?? ""}' (\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _)`);
  return false;
}
async function recordHistory3(deps, dir, entry) {
  if (!deps.history) return;
  try {
    await deps.history.append(dir, entry);
  } catch (e) {
    deps.io.err(`WARN: history \u5199\u5165\u5931\u8D25: ${errMsg(e)}`);
  }
}
async function writeDeps(deps, dir, next) {
  try {
    await deps.store.set(dir, "depends_on", next);
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`);
    return 1;
  }
  await recordHistory3(deps, dir, { ts: deps.clock(), kind: "set", field: "depends_on", to: next.join(",") });
  return 0;
}
async function cmdAddDep(deps, name2, dep) {
  if (!checkName4(deps, name2)) return 1;
  if (dep === void 0 || dep === "") {
    deps.io.err("ERROR: Usage: add-dep <change> <dep>");
    return 1;
  }
  if (!isValidChangeName(dep)) {
    deps.io.err(`ERROR: dep \u540D\u975E\u6CD5: '${dep}' (\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _)`);
    return 1;
  }
  if (dep === name2) {
    deps.io.err(`ERROR: add-dep \u4E0D\u80FD\u4F9D\u8D56\u81EA\u5DF1\uFF08\u81EA\u73AF\uFF09: ${name2}`);
    return 1;
  }
  const dir = changeDir(deps.cwd, name2);
  let state;
  try {
    state = await deps.store.read(dir);
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`);
    return 1;
  }
  const { deps: next, added } = addDependency(normalizeDeps(state.fields.depends_on), dep);
  if (!added) {
    deps.io.err(`[OK] ${name2}: depends_on \u5DF2\u542B ${dep}\uFF08\u53BB\u91CD\uFF0C\u672A\u91CD\u590D\u8FFD\u52A0\uFF09`);
    return 0;
  }
  return writeDeps(deps, dir, next);
}
async function cmdRemoveDep(deps, name2, dep) {
  if (!checkName4(deps, name2)) return 1;
  if (dep === void 0 || dep === "") {
    deps.io.err("ERROR: Usage: remove-dep <change> <dep>");
    return 1;
  }
  const dir = changeDir(deps.cwd, name2);
  let state;
  try {
    state = await deps.store.read(dir);
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`);
    return 1;
  }
  const next = removeDependency(normalizeDeps(state.fields.depends_on), dep);
  return writeDeps(deps, dir, next);
}
function sortUniqueChildren(rows) {
  const seen = /* @__PURE__ */ new Set();
  const uniq = [];
  for (const r of rows) {
    const k = `${r.name}	${r.archived}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(r);
  }
  return uniq.sort(
    (a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : a.archived === b.archived ? 0 : a.archived ? 1 : -1
  );
}
var tag = (archived) => archived ? "[archived]" : "[active]";
async function cmdChildren(deps, args, fs) {
  const name2 = args[0];
  const json = args.includes("--json");
  if (!checkName4(deps, name2)) return 1;
  const tree = await fs.loadTree(deps.cwd, deps.store);
  const rows = sortUniqueChildren(directChildren(tree, name2));
  if (json) {
    deps.io.out(JSON.stringify(rows.map((r) => ({ name: r.name, archived: r.archived }))));
    return 0;
  }
  if (rows.length === 0) {
    deps.io.out(`(none) ${name2} \u65E0\u5B50 change\uFF08\u65E0 depends_on \u6307\u5411\u5B83\uFF09`);
    return 0;
  }
  deps.io.out(`[CHILDREN] ${name2}\uFF08depends_on \u6307\u5411\u5B83\u7684 change\uFF09\uFF1A`);
  for (const r of rows) deps.io.out(`  ${r.name} ${tag(r.archived)}`);
  return 0;
}
async function cmdCascade(deps, name2, fs) {
  if (!checkName4(deps, name2)) return 1;
  const tree = await fs.loadTree(deps.cwd, deps.store);
  const desc = cascadeDependents(tree, name2);
  deps.io.out(`[CASCADE] ${name2} \u7684\u5168\u90E8\u4F20\u9012\u540E\u4EE3 dependent\uFF1A`);
  if (desc.length === 0) {
    deps.io.out("  (none) \u65E0\u540E\u4EE3 dependent");
    return 0;
  }
  for (const r of desc) deps.io.out(`  ${r.name} ${tag(r.archived)}`);
  return 0;
}
async function cmdCanonical(deps, args, fs) {
  const name2 = args[0];
  const json = args.includes("--json");
  if (!checkName4(deps, name2)) return 1;
  const dir = await fs.resolveDir(deps.cwd, name2);
  let state;
  try {
    state = await deps.store.read(dir);
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`);
    return 1;
  }
  const tree = await fs.loadTree(deps.cwd, deps.store);
  const rec = projectCanonical({
    name: name2,
    fields: state.fields,
    subtasks: stateSubtasks(state),
    children: canonicalChildNames(tree, name2),
    relatedFiles: stateRelatedFiles(state)
  });
  deps.io.out(json ? JSON.stringify(rec) : JSON.stringify(rec, null, 2));
  return 0;
}
async function cmdTask(deps, sub, args, fs = REAL_FS4) {
  switch (sub) {
    case "add-dep":
      return cmdAddDep(deps, args[0], args[1]);
    case "remove-dep":
      return cmdRemoveDep(deps, args[0], args[1]);
    case "children":
      return cmdChildren(deps, args, fs);
    case "cascade":
      return cmdCascade(deps, args[0], fs);
    case "canonical":
      return cmdCanonical(deps, args, fs);
    default:
      deps.io.err(`ERROR: \u672A\u77E5 task \u5B50\u547D\u4EE4: ${sub}\uFF08\u652F\u6301: add-dep remove-dep children cascade canonical\uFF09`);
      return 1;
  }
}

// packages/cli/src/commands/uninstall.ts
var norm = (p) => p.replace(/\/+$/, "");
var posix = (cwd, key) => `${norm(cwd)}/${key}`;
var REASON_FOR_KIND = {
  nested: "Strip pipeline hooks; preserve user fields",
  flat: "Strip pipeline hooks; preserve user fields"
};
async function buildPlan(fs, cwd, kept) {
  const plan = { deletions: [], modifications: [], preserved: [], stubbed: [], missing: [] };
  const deletedPaths = Object.keys(kept).filter((k) => k !== WORKFLOW_DIR && !k.startsWith(`${WORKFLOW_DIR}/`));
  for (const [key, hash] of Object.entries(kept)) {
    if (key === WORKFLOW_DIR || key.startsWith(`${WORKFLOW_DIR}/`)) continue;
    const abs = posix(cwd, key);
    const content = await fs.readText(abs);
    if (content === void 0) {
      if (await fs.exists(abs)) plan.preserved.push({ key, reason: "unreadable \u2014 conservatively preserved" });
      else plan.missing.push(key);
      continue;
    }
    const kind = structuredKindForKey(key);
    if (kind === null) {
      if (isOwnedModified(content, hash)) plan.preserved.push({ key, reason: "user-modified" });
      else plan.deletions.push(key);
      continue;
    }
    if (isStubScrubKind(kind)) {
      plan.stubbed.push({ key, reason: `scrubber not implemented in lite (honest stub: ${kind})` });
      continue;
    }
    const { content: scrubbed, fullyEmpty } = scrubStructured(kind, content, deletedPaths);
    if (fullyEmpty) plan.deletions.push(key);
    else plan.modifications.push({ key, content: scrubbed, reason: REASON_FOR_KIND[kind] ?? "Strip pipeline entries" });
  }
  return plan;
}
async function renderPlan(deps, fs, cwd, plan) {
  const hasWorkflow = await fs.isDir(posix(cwd, WORKFLOW_DIR));
  const nDel = plan.deletions.length + (hasWorkflow ? 1 : 0);
  deps.io.out(`Will be deleted (${nDel} entries):`);
  for (const k of plan.deletions) deps.io.out(`  - ${k}`);
  if (hasWorkflow) deps.io.out(`  - ${WORKFLOW_DIR}/  (entire directory)`);
  if (plan.modifications.length > 0) {
    deps.io.out(`Will be modified (${plan.modifications.length} files):`);
    for (const m of plan.modifications) deps.io.out(`  ~ ${m.key}  (${m.reason})`);
  }
  if (plan.preserved.length > 0) {
    deps.io.out(`Preserved / kept (${plan.preserved.length}):`);
    for (const p of plan.preserved) deps.io.out(`  = ${p.key}  (${p.reason})`);
  }
  if (plan.stubbed.length > 0) {
    deps.io.out(`Skipped \u2014 scrubber stub not implemented in lite (${plan.stubbed.length}):`);
    for (const s of plan.stubbed) deps.io.out(`  ? ${s.key}  (${s.reason})`);
  }
  if (plan.missing.length > 0) {
    deps.io.out(`(${plan.missing.length} manifest entries already missing on disk \u2014 skipped.)`);
  }
}
async function cleanupEmptyDirs(fs, cwd, dir) {
  if (!dir || dir === ".") return;
  if (!isManagedPath(dir)) return;
  if (isManagedRootDir(dir)) return;
  const abs = posix(cwd, dir);
  if (!await fs.isDir(abs)) return;
  if ((await fs.listDir(abs)).length !== 0) return;
  if (!await fs.rmdirEmpty(abs)) return;
  const parent = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : ".";
  if (parent !== "." && parent !== dir && !isManagedRootDir(parent)) await cleanupEmptyDirs(fs, cwd, parent);
}
async function finalPassRemoveEmptyRoots(fs, cwd) {
  let dirs = 0;
  const managed = [".pipeline", ".claude", ".codex", ".agents", ".agents/skills"].filter((d) => d !== WORKFLOW_DIR).sort((a, b) => b.split("/").length - a.split("/").length);
  for (const md of managed) {
    const abs = posix(cwd, md);
    if (!await fs.isDir(abs)) continue;
    if ((await fs.listDir(abs)).length !== 0) continue;
    if (!await fs.rmdirEmpty(abs)) continue;
    dirs++;
    let parent = md.includes("/") ? md.slice(0, md.lastIndexOf("/")) : ".";
    while (parent !== "." && parent) {
      const pabs = posix(cwd, parent);
      if (!await fs.exists(pabs)) break;
      if ((await fs.listDir(pabs)).length !== 0) break;
      if (!await fs.rmdirEmpty(pabs)) break;
      dirs++;
      parent = parent.includes("/") ? parent.slice(0, parent.lastIndexOf("/")) : ".";
    }
  }
  return dirs;
}
async function executePlan(fs, cwd, plan) {
  const res = { deletedFiles: 0, modifiedFiles: 0, deletedDirs: 0 };
  for (const m of plan.modifications) {
    await fs.writeText(posix(cwd, m.key), m.content);
    res.modifiedFiles++;
  }
  const dirCandidates = /* @__PURE__ */ new Set();
  for (const key of plan.deletions) {
    const abs = posix(cwd, key);
    if (!await fs.exists(abs)) continue;
    if (await fs.unlink(abs)) {
      res.deletedFiles++;
      if (key.includes("/")) dirCandidates.add(key.slice(0, key.lastIndexOf("/")));
    }
  }
  const wfAbs = posix(cwd, WORKFLOW_DIR);
  if (await fs.exists(wfAbs)) {
    await fs.rmrf(wfAbs);
    res.deletedDirs++;
  }
  for (const dp of [...dirCandidates].sort()) await cleanupEmptyDirs(fs, cwd, dp);
  res.deletedDirs += await finalPassRemoveEmptyRoots(fs, cwd);
  return res;
}
async function cmdUninstall(deps, opts, fs = createOwnedFs()) {
  const cwd = deps.cwd;
  if (norm(cwd) === norm(fs.homeDir()) && !fs.homedirBypass()) {
    deps.io.err("[uninstall] HARD STOP: \u62D2\u7EDD\u5728 $HOME \u6839\u5378\u8F7D\uFF08\u4F1A\u7275\u8FDE ~ \u7684\u8FD0\u884C\u65F6\u6570\u636E\uFF09\u3002PIPELINE_ALLOW_HOMEDIR=1 \u4E25\u683C\u65C1\u8DEF\u3002");
    return 1;
  }
  let manifestText;
  try {
    manifestText = await readOwnedManifestText(fs, cwd);
  } catch (e) {
    deps.io.err(`[uninstall] \u8BFB\u6E05\u5355\u5931\u8D25: ${errMsg(e)}`);
    return 1;
  }
  if (manifestText === void 0) {
    deps.io.err(`[uninstall] pipeline \u672A\u5B89\u88C5\u4E8E\u6B64\u76EE\u5F55\uFF08\u65E0 ${OWNED_MANIFEST}\uFF09\u2014\u2014\u65E0\u9700\u5378\u8F7D\u3002`);
    return 0;
  }
  const manifest = parseOwnedManifest(manifestText);
  if (manifestText.trim() === "" || Object.keys(manifest).length === 0) {
    deps.io.err(`[uninstall] \u6240\u6709\u6743\u6E05\u5355\u65E0\u6709\u6548\u6761\u76EE\uFF08\u7A7A\u5BF9\u8C61/\u635F\u574F\uFF09: ${OWNED_MANIFEST}\u2014\u2014\u62D2\u7EDD\u76F2\u5220\u3002`);
    return 1;
  }
  const agentsMdContent = await fs.readText(posix(cwd, AGENTS_MD));
  const { kept, pruned } = pruneOwnedManifest(manifest, {
    knownKeys: Object.keys(manifest),
    agentsMdContent
  });
  if (pruned.length > 0) {
    deps.io.err(`[uninstall] \u526A\u9664 ${pruned.length} \u6761\u5B64\u513F\u6E05\u5355\u9879\uFF08\u53BB\u6BD2\u4E2D\u6BD2\u6E05\u5355\uFF09: ${pruned.join(", ")}`);
    if (!opts.dryRun) await saveOwnedManifest(fs, cwd, kept);
  }
  const plan = await buildPlan(fs, cwd, kept);
  await renderPlan(deps, fs, cwd, plan);
  if (opts.dryRun) {
    deps.io.err("[uninstall] Dry run \u2014 \u672A\u4FEE\u6539\u4EFB\u4F55\u6587\u4EF6\u3002");
    return 0;
  }
  if (!opts.yes) {
    deps.io.err("[uninstall] \u9700 --yes/-y \u786E\u8BA4\u5378\u8F7D\uFF08\u811A\u672C/\u975E\u4EA4\u4E92\u73AF\u5883\u5FC5\u9700\uFF09\uFF0C\u6216 --dry-run \u9884\u89C8\u2014\u2014\u62D2\u7EDD\u65E0\u786E\u8BA4\u5220\u9664\u3002");
    return 1;
  }
  const res = await executePlan(fs, cwd, plan);
  await fs.unlink(posix(cwd, OWNED_MANIFEST));
  await fs.unlink(posix(cwd, VERSION_FILE));
  deps.io.out(
    `[uninstall] \u5378\u8F7D\u5B8C\u6210\uFF1A${res.deletedFiles} files deleted, ${res.modifiedFiles} files modified, ${res.deletedDirs} directories removed, ${plan.preserved.length} preserved, ${plan.stubbed.length} stub-skipped.`
  );
  return 0;
}

// packages/cli/src/commands/status.ts
function field(row, name2) {
  return str(row.state.fields[name2]);
}
async function collectActive(deps) {
  const names = [...await deps.listChanges(changesRoot(deps.cwd))].sort();
  const rows = [];
  for (const name2 of names) {
    try {
      const state = await deps.store.read(changeDir(deps.cwd, name2));
      if (str(state.fields.archived) === "true") continue;
      rows.push({ name: name2, state });
    } catch (e) {
      deps.io.err(`WARN: \u8DF3\u8FC7 ${name2}\uFF08\u8BFB\u53D6\u5931\u8D25: ${errMsg(e)}\uFF09`);
    }
  }
  return rows;
}
function statusJson(row) {
  return {
    name: row.name,
    track: field(row, "track"),
    phase: field(row, "phase"),
    phase_status: field(row, "phase_status"),
    verify_result: field(row, "verify_result"),
    updated_at: field(row, "updated_at")
  };
}
async function cmdStatus2(deps, name2, opts) {
  if (name2 !== void 0) {
    if (!isValidChangeName(name2)) {
      deps.io.err(`ERROR: change-name \u975E\u6CD5: '${name2}' (\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _)`);
      return 1;
    }
    let state;
    try {
      state = await deps.store.read(changeDir(deps.cwd, name2));
    } catch (e) {
      deps.io.err(`ERROR: ${errMsg(e)}`);
      return 1;
    }
    const row = { name: name2, state };
    if (opts.json) {
      deps.io.out(JSON.stringify({ active_changes: [statusJson(row)] }));
      return 0;
    }
    for (const line of renderKV([
      ["change", row.name],
      ["track", display(state.fields.track)],
      ["phase", `${display(state.fields.phase)} (${display(state.fields.phase_status)})`],
      ["verify", display(state.fields.verify_result)],
      ["updated", display(state.fields.updated_at)]
    ])) {
      deps.io.out(line);
    }
    return 0;
  }
  const rows = await collectActive(deps);
  if (opts.json) {
    deps.io.out(JSON.stringify({ active_changes: rows.map(statusJson) }));
    return 0;
  }
  if (rows.length === 0) {
    deps.io.out("\u65E0\u6D3B\u8DC3 change");
    return 0;
  }
  const table = renderTable(
    ["NAME", "TRACK", "PHASE", "STATUS", "VERIFY", "UPDATED"],
    rows.map((r) => [
      r.name,
      display(r.state.fields.track),
      display(r.state.fields.phase),
      display(r.state.fields.phase_status),
      display(r.state.fields.verify_result),
      display(r.state.fields.updated_at)
    ])
  );
  for (const line of table) deps.io.out(line);
  return 0;
}
async function cmdList4(deps, opts) {
  const rows = await collectActive(deps);
  if (opts.json) {
    deps.io.out(
      JSON.stringify({
        changes: rows.map((r) => ({
          // 键序即 schema（status.test.ts 锚定逐字输出），改动 = 契约变更
          name: r.name,
          track: field(r, "track"),
          phase: field(r, "phase"),
          phase_status: field(r, "phase_status"),
          assignee: field(r, "assignee")
        }))
      })
    );
    return 0;
  }
  if (rows.length === 0) {
    deps.io.out("\u65E0\u6D3B\u8DC3 change");
    return 0;
  }
  const table = renderTable(
    ["NAME", "TRACK", "PHASE", "STATUS", "ASSIGNEE"],
    rows.map((r) => [
      r.name,
      display(r.state.fields.track),
      display(r.state.fields.phase),
      display(r.state.fields.phase_status),
      display(r.state.fields.assignee)
    ])
  );
  for (const line of table) deps.io.out(line);
  return 0;
}

// packages/cli/src/commands/internalSkillGate.ts
function parseHistoryLines(raw) {
  const out = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
    }
  }
  return out;
}
function skillIdFromToolRaw(raw) {
  const m = /^Skill: (.+)$/.exec(raw);
  return m ? m[1] : null;
}
function completedSkillsSinceStepEntry(lines, currentStepId) {
  let enteredAt = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]?.kind === "transition" && lines[i]?.to === currentStepId) {
      enteredAt = i;
      break;
    }
  }
  const completed = /* @__PURE__ */ new Set();
  for (const line of lines.slice(enteredAt + 1)) {
    if (line.kind !== "tool") continue;
    const id = skillIdFromToolRaw(line.raw ?? "");
    if (id) completed.add(id);
  }
  return completed;
}
async function cmdInternalSkillGate(deps, name2, skillId) {
  try {
    if (!isValidChangeName(name2)) {
      deps.io.err(`WARN: internal-skill-gate \u6536\u5230\u975E\u6CD5 change \u540D '${name2}'\uFF0Cfail-open \u653E\u884C`);
      return 0;
    }
    const dir = changeDir(deps.cwd, name2);
    const state = await deps.store.read(dir);
    const workflowName = resolveWorkflowName(state);
    if (workflowName === "default") return 0;
    const wf = loadWorkflow(deps.cwd, workflowName);
    if (!wf) {
      deps.io.err(`WARN: workflow '${workflowName}' \u672A\u627E\u5230\uFF0Cfail-open \u653E\u884C`);
      return 0;
    }
    const currentStepId = str(state.fields.phase);
    const step = resolveStep(wf, currentStepId);
    if (!step) {
      deps.io.err(`WARN: step '${currentStepId}' \u4E0D\u5728 workflow '${workflowName}' \u91CC\uFF0Cfail-open \u653E\u884C`);
      return 0;
    }
    const historyRaw = await deps.readHistoryRaw?.(dir) ?? "";
    const lines = parseHistoryLines(historyRaw);
    const completedSinceEntry = completedSkillsSinceStepEntry(lines, currentStepId);
    if (isSkillUnlocked(skillId, step.skills, completedSinceEntry)) return 0;
    const ref = step.skills.find((s) => s.id === skillId);
    if (!ref) {
      deps.io.err(
        `\u3010pipeline \u95E8\u3011skill '${skillId}' \u4E0D\u5728 step '${currentStepId}'\uFF08workflow '${workflowName}'\uFF09\u58F0\u660E\u7684 skills \u5217\u8868\u91CC\uFF0C\u6682\u4E0D\u53EF\u7528`
      );
    } else {
      const missing = (ref.depends_on ?? []).filter((d) => !completedSinceEntry.has(d));
      deps.io.err(
        `\u3010pipeline \u95E8\u3011skill '${skillId}' \u5728 step '${currentStepId}'\uFF08workflow '${workflowName}'\uFF09\u672A\u89E3\u9501\uFF1A\u8FD8\u9700\u5148\u5B8C\u6210 ${missing.join(", ")}\uFF08\u672C\u6B21\u8FDB\u5165\u8BE5 step \u4E4B\u540E\uFF09`
      );
    }
    return 2;
  } catch (e) {
    deps.io.err(`WARN: internal-skill-gate \u5185\u90E8\u5F02\u5E38\uFF0Cfail-open \u653E\u884C: ${errMsg(e)}`);
    return 0;
  }
}

// packages/cli/src/commands/migrateWorkflow.ts
async function cmdMigrateWorkflow(deps, name2) {
  if (!isValidChangeName(name2)) {
    deps.io.err(`ERROR: change-name \u975E\u6CD5: '${name2}' (\u4EC5\u5141\u8BB8 a-z A-Z 0-9 - _)`);
    return 1;
  }
  const dir = changeDir(deps.cwd, name2);
  try {
    const current = await deps.store.get(dir, "workflow");
    if (current !== "default" && current !== void 0) {
      deps.io.err(`[MIGRATE] ${name2}: workflow='${current}'\uFF08\u975E default\uFF0C\u89C6\u4E3A\u771F\u5B9E\u5B9A\u5236\uFF0C\u8DF3\u8FC7\uFF0C\u4E0D\u8986\u5199\uFF09`);
      return 0;
    }
    const expect = current ?? "default";
    const ok = await deps.store.cas(dir, "workflow", expect, "default");
    if (!ok) {
      deps.io.err(
        `[MIGRATE] ${name2}: workflow \u5B57\u6BB5\u5728\u8BFB\u53D6\u540E\u3001\u843D\u76D8\u524D\u88AB\u5E76\u53D1\u4FEE\u6539\uFF08cas \u672A\u547D\u4E2D\uFF09\uFF0C\u89C6\u4E3A\u51FA\u73B0\u771F\u5B9E\u5E76\u53D1\u5199\u5165\uFF0C\u8DF3\u8FC7\u672C\u6B21\u8FC1\u79FB\u5199\u5165\uFF0C\u4E0D\u8986\u5199`
      );
      return 0;
    }
    deps.io.err(`[MIGRATE] ${name2}: workflow \u5B57\u6BB5\u5DF2\u786E\u8BA4/\u8865\u9F50\u4E3A default\uFF08phase \u7B49\u5176\u4F59\u5B57\u6BB5\u503C\u4E0D\u53D8\uFF09`);
    return 0;
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`);
    return 1;
  }
}

// packages/cli/src/program.ts
var CliExit = class extends Error {
  constructor(code) {
    super(`exit ${code}`);
    this.code = code;
  }
  code;
};
function bail(code) {
  if (code !== 0) throw new CliExit(code);
}
var stripNl = (s) => s.replace(/\n$/, "");
function buildProgram(deps) {
  const program2 = new Command("pipeline");
  program2.description("pipeline-lite \u72B6\u6001\u673A CLI\uFF08CONTRACT \xA73\uFF09").exitOverride().configureOutput({
    writeOut: (s) => deps.io.out(stripNl(s)),
    writeErr: (s) => deps.io.err(stripNl(s))
  });
  program2.command("init <name>").description("\u521D\u59CB\u5316 change\uFF08stdout \u65E0\u8F93\u51FA\uFF0C\u8DEF\u5F84\u4FE1\u606F\u8D70 stderr\uFF09").option("--track <track>", "chat | pm | frontend | backend").option("--preset <preset>", "full | hotfix | tweak").option("--user <user>", "created_by").option("--workflow <workflow>", "\u81EA\u5B9A\u4E49 workflow \u540D\uFF08.pipeline/workflows/<name>.yaml\uFF09\uFF0C\u7F3A\u7701 default").action(async (name2, opts) => bail(await cmdInit(deps, name2, opts)));
  program2.command("setup [sub]").description("\u5B89\u88C5\u540E\u5168\u529F\u80FD\u5C31\u7EEA\u5F15\u5BFC:\u8F6F\u94FE pipeline \u5230 PATH + \u6309 registry \u9009\u88C5\u6280\u80FD + docker/\u955C\u50CF/\u51ED\u8BC1\u5C31\u7EEA\u68C0\u67E5").option("--dry-run", "\u53EA\u6253\u5370\u8BA1\u5212\u9AA8\u67B6,\u7EDD\u4E0D\u8F6F\u94FE/\u5199\u6587\u4EF6").option("-y, --yes", "\u8DF3\u8FC7\u6280\u80FD\u5B89\u88C5\u7684 y/N \u786E\u8BA4\u4F4D\uFF08\u81EA\u52A8\u5316\u73AF\u5883\u7528;\u975E TTY \u7F3A\u7701\u5224 No \u4E0D\u88C5\uFF09").allowUnknownOption().action(async (sub, opts) => bail(await cmdSetup(deps, sub, { dryRun: opts.dryRun, yes: opts.yes })));
  program2.command("get <name> <field>").description("\u8BFB\u5B57\u6BB5\uFF08stdout: \u88F8\u503C\uFF1B\u5B57\u6BB5\u7F3A\u5931/\u672A\u77E5 \u2192 \u7A7A\u884C + exit 0\uFF09").action(async (name2, fieldName) => bail(await cmdGet(deps, name2, fieldName)));
  program2.command("set <name> <field> <value>").description("\u5199\u5B57\u6BB5\uFF08\u65E0\u8F93\u51FA\uFF1B\u56DB\u95F8\u62D2\u5199 exit 1\uFF09").action(async (name2, fieldName, value) => bail(await cmdSet(deps, name2, fieldName, value)));
  program2.command("set-many <name> <kv...>").description("\u591A\u5B57\u6BB5\u539F\u5B50\u5199 key=value ...\uFF08\u65E0\u8F93\u51FA\uFF09").action(async (name2, kv) => bail(await cmdSetMany(deps, name2, kv)));
  program2.command("cas <name> <field> <expect> <next>").description("compare-and-set\uFF08\u65E0\u8F93\u51FA\uFF1B\u4E0D\u5339\u914D exit 3\uFF09").action(async (name2, fieldName, expect, next) => bail(await cmdCas(deps, name2, fieldName, expect, next)));
  program2.command("transition <name> <event>").description("\u72B6\u6001\u673A\u8F6C\u6362\uFF08stdout \u65E0\u8F93\u51FA\uFF0C[TRANSITION] \u8D70 stderr\uFF1B\u975E\u6CD5/\u672A\u77E5\u4E8B\u4EF6 exit 1\uFF09").action(async (name2, event) => bail(await cmdTransition(deps, name2, event)));
  program2.command("check <name>").description("guard \u524D\u7F6E\u6821\u9A8C\uFF08\u4EBA\u8BFB\u62A5\u544A\uFF1B\u4E0D\u8FC7 exit 2\uFF09").action(async (name2) => bail(await cmdCheck(deps, name2)));
  program2.command("advance <name>").description("auto-transition \u4E2D\u95F4\u6863\uFF1Aguard \u5168\u7EFF\u81EA\u52A8\u63A8\u8FDB\uFF0C\u649E\u4E09\u95E8/\u7EC8\u6001/guard \u4E0D\u8FC7\u5373\u505C\uFF08HITL\uFF0CD12>Comet\uFF09").option("--max-steps <n>", "\u9632\u5931\u63A7\u4FDD\u9669\u4E1D\uFF08\u9ED8\u8BA4 12\uFF09", (v) => parseInt(v, 10)).option("--dry-run", "\u53EA\u62A5\u8BA1\u5212\u4E0D\u63A8\u8FDB").option("--through-gates", "\u653E\u884C\u590D\u6838\u76F8\u4F4D\uFF08confirm/interaction \u786C\u95E8\u4ECD\u4E0D\u8DE8\u8D8A\uFF09").action(async (name2, opts) => bail(await cmdAdvance(deps, name2, opts)));
  program2.command("handoff <name>").description("\u76F8\u4F4D handoff \u4E0A\u4E0B\u6587\u538B\u7F29\uFF08\u5BF9\u6807 Comet CONTEXT-COMPRESSION\uFF0CD11\uFF09").option("--phase <p>", "\u8986\u5199\u76F8\u4F4D\uFF08\u9ED8\u8BA4\u5F53\u524D\u76F8\u4F4D\uFF09").option("--json", "JSON \u8F93\u51FA\uFF08\u542B\u538B\u7F29\u7387\uFF09").action(async (name2, opts) => bail(await cmdHandoff(deps, name2, opts)));
  program2.command("import <name>").description("\u8001\u4ED3 change \u5386\u53F2\u533A \u2192 .pipeline-history.jsonl\uFF08--strip \u540C\u65F6\u6E05\u7406 YAML \u5386\u53F2\u8282\uFF09").option("--strip", "\u5BFC\u5165\u540E\u4ECE .pipeline.yaml \u79FB\u9664\u5386\u53F2\u8282\uFF08\u5176\u4F59\u5C3E\u5185\u5BB9\u4FDD\u7559\uFF09").action(async (name2, opts) => bail(await cmdImport(deps, name2, opts)));
  program2.command("doctor").description("\u7EDF\u4E00\u5065\u5EB7\u9762\uFF1A\u54EA\u4E9B\u4FDD\u969C\u6B64\u523B\u771F\u7684\u5728\u751F\u6548/\u5DF2\u9759\u9ED8\u964D\u7EA7\uFF08exit 1=\u6709\u7EA2\u706F\uFF09").option("--json", "JSON \u8F93\u51FA\uFF08schema \u7A33\u5B9A\uFF09").action(async (opts) => bail(await cmdDoctor(deps, opts)));
  program2.command("task <sub> [args...]").description("task lifecycle\uFF1Aadd-dep / remove-dep <name> <dep> \xB7 children / cascade / canonical <name>").option("--json", "JSON \u8F93\u51FA\uFF08children / canonical\uFF09").action(async (sub, args, opts) => bail(await cmdTask(deps, sub, opts.json ? [...args, "--json"] : args)));
  program2.command("scaffold <sub> [args...]").description("Trellis parity\uFF1Ascaffold \u6309\u7C7B\u578B\u94FA\u5206\u5C42\u7A7A\u6587\u6863\u96C6 \xB7 resolve-workflow \u591A id \u89E3\u6790\uFF08D2/B16\uFF09").allowUnknownOption().action(async (sub, args) => bail(await cmdScaffold(deps, sub, args)));
  program2.command("spec <sub> [args...]").description("living-spec\uFF1Aspecs \xB7 set-spec-scope <cap> [scope] \xB7 inject-jsonl <cap> [agent]").option("--json", "JSON \u8F93\u51FA\uFF08specs\uFF09").action(async (sub, args, opts) => bail(await cmdSpec(deps, sub, opts.json ? [...args, "--json"] : args)));
  program2.command("session <sub> [args...]").description("session\uFF1Aactivate <name> \xB7 route-context <name> [--json]").option("--json", "JSON \u8F93\u51FA\uFF08route-context\uFF09").action(async (sub, args, opts) => bail(await cmdSession(deps, sub, opts.json ? [...args, "--json"] : args)));
  program2.command("inbox").description("\u6536\u4EF6\u7BB1\uFF1A\u7B49\u5F85\u4EBA\u5DE5\u51B3\u7B56\u7684 change\uFF08\u4E09\u95E8 marker + \u590D\u6838\u76F8\u4F4D\uFF09").option("--json", "JSON \u8F93\u51FA\uFF08schema \u7A33\u5B9A\uFF09").option("--html", "\u81EA\u8DB3\u9759\u6001\u5355\u9875\uFF08\u91CD\u5B9A\u5411\u5230\u6587\u4EF6\u7528\u6D4F\u89C8\u5668\u6253\u5F00\uFF09").action(async (opts) => bail(await cmdInbox(deps, opts)));
  program2.command("status [name]").description("change \u6458\u8981\uFF08\u65E0 name \u5217\u5168\u90E8\u6D3B\u8DC3\uFF09").option("--json", "JSON \u8F93\u51FA\uFF08schema \u7A33\u5B9A\uFF09").action(async (name2, opts) => bail(await cmdStatus2(deps, name2, opts)));
  program2.command("list").description("\u6D3B\u8DC3 change \u8868").option("--json", "JSON \u8F93\u51FA\uFF08schema \u7A33\u5B9A\uFF09").action(async (opts) => bail(await cmdList4(deps, opts)));
  program2.command("sync [sub]").description("\u9879\u76EE\u5185\u8D44\u4EA7\u540C\u6B65\uFF08downgrade-guard / prune / config \u95E8 / --migrate \u786C\u95F8\uFF09").option("--migrate", "\u6267\u884C\u8FC1\u79FB\uFF08\u7F3A\u7701\u53EA\u62A5\u544A\u4E0D\u6539\u76D8\uFF09").option("--allow-downgrade", "\u653E\u884C\u964D\u7EA7\u540C\u6B65").action(async (sub, opts) => {
    const installedJson = await deps.readInstalledPlugins?.();
    bail(await cmdSync(deps, {
      sub,
      cliVersion: deps.pluginVersion ?? "unknown",
      migrate: opts.migrate,
      allowDowngrade: opts.allowDowngrade,
      installedJson
    }));
  });
  program2.command("uninstall").description("\u5378\u8F7D + \u6240\u6709\u6743 scrubber\uFF08\u53EA\u5220\u81EA\u5DF1\u88C5\u7684\u3001\u7528\u6237\u6539\u8FC7\u7684\u4FDD\u7559\uFF09").option("-y, --yes", "\u975E\u4EA4\u4E92\u786E\u8BA4").option("--dry-run", "\u53EA\u6253\u5370\u8BA1\u5212\u4E0D\u843D\u76D8").action(async (opts) => bail(await cmdUninstall(deps, { yes: opts.yes, dryRun: opts.dryRun })));
  program2.command("afk <sub> [name]").description("AFK \u81EA\u52A8\u5316\uFF1Aenqueue <name> \u6302\u961F / scan \u5C31\u7EEA\u961F\u5217 / status [name] \u6CF3\u9053 / run \u771F\u8DD1 docker \u6C99\u7BB1 / cancel <name> \u53D6\u6D88\u8FD0\u884C\u4E2D\u4EFB\u52A1\uFF08\u843D\u53D6\u6D88\u6807\u8BB0 + docker kill\uFF0C\u5BF9\u9F50 server /api/afk/:name/cancel\uFF09").option("--json", "JSON \u8F93\u51FA").option("--level <level>", "run\uFF1A\u5206\u7EA7\u653E\u6743\u6863\u4F4D\u8986\u76D6\uFF08L1|L2|L3\uFF0C\u7F3A\u7701 L1 report-only \u5B89\u5168\u9ED8\u8BA4\uFF09").option("--image <image>", "run\uFF1Asandcastle \u955C\u50CF\u540D\uFF08\u7F3A\u7701 sandcastle:local\uFF09").action(async (sub, name2, opts) => bail(await cmdAfk(deps, sub, name2, opts)));
  program2.command("loops <sub> [args...]").alias("loop").description("loop \u6CBB\u7406\uFF1Ainit \u8D77\u8349\u8349\u7A3F\uFF08\u5411\u5BFC/\u975E\u4EA4\u4E92\uFF09\xB7 list \u767B\u8BB0\u8868 \xB7 enforce R1-R11 \u88C1\u51B3 \xB7 status\uFF08B18/D16\uFF0CL1\u2192L3 \u5206\u7EA7\u653E\u6743\uFF09").allowUnknownOption().addHelpText("after", `
\u5B50\u547D\u4EE4:
  init [flags]              \u8D77\u8349\u4E00\u4E2A paused \u8349\u7A3F loop\uFF08TTY \u4E0B\u65E0 flags \u2192 \u4EA4\u4E92\u5411\u5BFC\uFF1B\u975E\u4EA4\u4E92\u89C1\u4E0B\uFF09
  list [--json]             \u767B\u8BB0\u8868
  status [--json]           \u5404 loop \u5206\u7EA7\u653E\u6743\u72B6\u6001\uFF08L1 \u62A5\u544A / L2 \u8F85\u52A9 / L3 \u65E0\u4EBA\u503C\u5B88\uFF09
  enforce [--loop <id>]     \u8DD1 R1-R11 \u88C1\u51B3\u51FA verdict
  budget|cost [loop]        token \u9884\u7B97 / \u6210\u672C\u4F30\u7B97
  graduate [loop]          \u5347\u964D\u6863\u88C1\u51B3\uFF08\u6BD5\u4E1A\u5236\uFF09
  level <loop> [set <L1|L2|L3>] [--confirm]   \u67E5\u770B/\u6539\u6863\uFF08\u5347\u6863\u987B\u51C6\u5165 + --confirm\uFF09

loops init \u975E\u4EA4\u4E92 flags\uFF08agent/CI\uFF1B\u7F3A TTY \u6216 --yes \u8D70\u9ED8\u8BA4\uFF09:
  --id <id>       *\u5FC5\u586B  loop \u6807\u8BC6\uFF08kebab-case\uFF09
  --goal <text>   *\u5FC5\u586B  \u8FD9\u4E2A loop \u8981\u66FF\u4F60\u505A\u4EC0\u4E48
  --runner <claude-code|codex>   \u6267\u884C agent\uFF08\u7F3A\u7701 claude-code\uFF09
  --kind <orchestrator|executor> \xB7 --prefix <change \u524D\u7F00> \xB7 --cadence <4h> \xB7 --risk <low|medium|high> \xB7 --yes

\u793A\u4F8B:
  pipeline loops init                                   # TTY \u4EA4\u4E92\u5411\u5BFC
  pipeline loops init --id nightly-fix --goal "\u591C\u95F4\u4FEE flaky \u6D4B\u8BD5" --runner codex --yes`).action(async (sub, args) => bail(await cmdLoops(deps, sub, args)));
  program2.command("channel <sub> [args...]").description("\u6B63\u4EA4 worker \u5C42\uFF08event-sourced\uFF09\uFF1Acreate/send/wait/messages/thread/forum/registry \u2026").allowUnknownOption().action(async (sub, args) => bail(await cmdChannel(deps, sub, args)));
  program2.command("mem <sub> [args...]").description("\u8DE8 runtime \u4F1A\u8BDD\u68C0\u7D22\uFF1Alist \xB7 search <kw> \xB7 context <id> \xB7 extract <id> \xB7 projects").allowUnknownOption().action(async (sub, args) => bail(await cmdMem(deps, sub, args)));
  program2.command("tap <sub> [args...]").description("tap \u6D41\u91CF\u4EE3\u7406\uFF1Astart <client...> [--ca [dir]] [--json] [-- <command> ...]\uFF08daemon \u542F\u52A8\u5668\uFF0C#34-wire\uFF09").allowUnknownOption().action(async (sub, args) => bail(await cmdTap(deps, sub, args)));
  program2.command("_gen-router-sh <manifest>").description("[\u5185\u90E8] \u4ECE manifest \u6D3E\u751F router \u7F13\u5B58 bash\uFF08router.sh \u8C03\u7528\uFF09").action(async (manifest) => bail(await cmdGenRouterSh(deps, manifest)));
  program2.command("internal-skill-gate <name> <skillId>").description("[\u5185\u90E8] \u975E default workflow \u7684 skill DAG \u89E3\u9501\u5224\u5B9A\uFF08hooks/gate.sh \u59D4\u6258\u76EE\u6807\uFF1B0=\u653E\u884C 2=\u62E6\u622A\uFF09").action(async (name2, skillId) => bail(await cmdInternalSkillGate(deps, name2, skillId)));
  program2.command("migrate-workflow <name>").description("[\u4E00\u6B21\u6027] \u8001\u683C\u5F0F change \u8865\u9F50/\u786E\u8BA4 workflow \u5B57\u6BB5\u4E3A default\uFF08\u771F\u5B9E\u81EA\u5B9A\u4E49 workflow \u4E0D\u8986\u76D6\uFF09").action(async (name2) => bail(await cmdMigrateWorkflow(deps, name2)));
  program2.addHelpText(
    "after",
    "\n\u9996\u6B21\u5B89\u88C5\uFF1Apipeline setup\uFF08\u88C5\u6280\u80FD + \u914D\u5C31\u7EEA\uFF09\u2014\u2014\u9996\u6B21\u7528\u672C\u63D2\u4EF6\u5148\u8DD1 setup\uFF0C\u518D\u7528 init \u8D77 change\u3002"
  );
  return program2;
}

// packages/cli/src/main.ts
function isoNow() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
}
function gitHeadSha(cwd) {
  return new Promise((resolve10) => {
    execFile4("git", ["rev-parse", "HEAD"], { cwd }, (_err, stdout) => {
      resolve10((stdout ?? "").trim());
    });
  });
}
async function listChanges(changesRoot2) {
  let entries;
  try {
    entries = await readdir5(changesRoot2, { withFileTypes: true });
  } catch {
    return [];
  }
  const names = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "archive") continue;
    try {
      await access2(join35(changesRoot2, entry.name, ".pipeline.yaml"));
      names.push(entry.name);
    } catch {
    }
  }
  return names.sort();
}
async function readGateMarkers(cwd) {
  const out = [];
  for (const kind of ["confirm", "review", "interaction"]) {
    try {
      const p = join35(cwd, `.pipeline-pending-${kind}`);
      const st = await stat8(p);
      out.push({ kind, ageMs: Date.now() - st.mtimeMs, raw: await readFile7(p, "utf8") });
    } catch {
    }
  }
  return out;
}
function makeGuardCtx(cwd) {
  const abs = (relPath) => join35(cwd, relPath);
  return (name2) => ({
    changeDirRel: `openspec/changes/${name2}`,
    fileExists: (p) => {
      try {
        return statSync5(abs(p)).isFile();
      } catch {
        return false;
      }
    },
    fileNonempty: (p) => {
      try {
        const st = statSync5(abs(p));
        return st.isFile() && st.size > 0;
      } catch {
        return false;
      }
    },
    readFile: (p) => {
      try {
        return readFileSync19(abs(p), "utf8");
      } catch {
        return void 0;
      }
    },
    dirExists: (p) => {
      try {
        return statSync5(abs(p)).isDirectory();
      } catch {
        return false;
      }
    },
    // 老 guard：find openspec/changes/archive -mindepth 1 -maxdepth 1 -type d -name "*-<dep>"
    changeArchived: (dep) => {
      try {
        return readdirSync6(abs("openspec/changes/archive"), { withFileTypes: true }).some((e) => e.isDirectory() && e.name.endsWith(`-${dep}`));
      } catch {
        return false;
      }
    },
    // 调度器执行路径旁路（老 guard PIPELINE_AUTOMATION_RUNNER=1 语义）
    automationRunner: process.env.PIPELINE_AUTOMATION_RUNNER === "1"
  });
}
function pluginRoot() {
  return join35(dirname9(fileURLToPath2(import.meta.url)), "..", "..", "..");
}
function manifestPath() {
  return join35(pluginRoot(), "templates", "manifest.yaml");
}
function readPluginVersion() {
  try {
    const raw = readFileSync19(join35(pluginRoot(), ".claude-plugin", "plugin.json"), "utf8");
    return JSON.parse(raw).version ?? "unknown";
  } catch {
    return "unknown";
  }
}
function safeReaddirDirs(dir) {
  try {
    return readdirSync6(dir, { withFileTypes: true }).filter((e) => e.isDirectory() || e.isSymbolicLink()).map((e) => e.name);
  } catch {
    return [];
  }
}
function readDisabledPluginKeys() {
  const disabled = /* @__PURE__ */ new Set();
  try {
    const raw = readFileSync19(join35(homedir8(), ".claude", "settings.json"), "utf8");
    const ep = JSON.parse(raw).enabledPlugins;
    if (ep !== null && typeof ep === "object") {
      for (const [key, val] of Object.entries(ep)) if (val === false) disabled.add(key);
    }
  } catch {
  }
  return disabled;
}
function scanInstalledSkillNames() {
  const home = homedir8();
  const names = /* @__PURE__ */ new Set();
  for (const n of safeReaddirDirs(join35(home, ".claude", "skills"))) names.add(n);
  for (const n of safeReaddirDirs(join35(home, ".agents", "skills"))) names.add(n);
  const cache2 = join35(home, ".claude", "plugins", "cache");
  const disabledPlugins = readDisabledPluginKeys();
  for (const marketplace of safeReaddirDirs(cache2)) {
    const mktDir = join35(cache2, marketplace);
    for (const plugin of safeReaddirDirs(mktDir)) {
      if (disabledPlugins.has(`${plugin}@${marketplace}`)) continue;
      names.add(plugin);
      for (const skill of safeReaddirDirs(join35(mktDir, plugin, "skills"))) names.add(skill);
    }
  }
  return names;
}
function makeDoctorProbes() {
  const root = pluginRoot();
  return {
    nodeVersion: () => process.version,
    gitAvailable: () => new Promise((resolve10) => {
      execFile4("git", ["--version"], (err) => resolve10(!err));
    }),
    pluginRoot: root,
    manifestError: () => {
      try {
        loadManifest(manifestPath());
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    },
    fileExists: (p) => {
      try {
        return statSync5(p).isFile();
      } catch {
        return false;
      }
    },
    fileExecutable: (p) => {
      try {
        accessSync(p, fsConstants.X_OK);
        return true;
      } catch {
        return false;
      }
    },
    dirExists: (p) => {
      try {
        return statSync5(p).isDirectory();
      } catch {
        return false;
      }
    },
    env: (name2) => process.env[name2],
    // 接入判定与 statusline.sh 头注释的接入方式同口径：settings.json 里引用了该脚本即算接入
    statuslineConfigured: () => {
      try {
        return readFileSync19(join35(homedir8(), ".claude", "settings.json"), "utf8").includes("statusline.sh");
      } catch {
        return false;
      }
    },
    runVerifySkills: () => new Promise((resolve10) => {
      execFile4(
        "bash",
        [join35(root, "tools", "verify-skills.sh"), "--quiet"],
        { timeout: 3e4 },
        (err, stdout, stderr) => {
          const errCode = err?.code;
          const code = err ? typeof errCode === "number" ? errCode : 1 : 0;
          resolve10({ code, output: `${stdout ?? ""}${stderr ?? ""}` });
        }
      );
    }),
    // BACKLOG #34e：tap 敏感能力状态供 doctor 明示（读 tap 本地状态，无副作用）
    tapStatus: () => {
      const s = tapStatus();
      return { intercepting: s.intercepting, captureEnabled: s.captureEnabled, message: s.message };
    },
    // 缺技能检测（批2 A1）：本机安装位扫描 + manifest 两表派生（bundle 里正确路径锚在此）
    installedSkillNames: () => scanInstalledSkillNames(),
    manifestSkills: () => {
      try {
        const m = loadManifest(manifestPath());
        return { mandatory: m.mandatorySkills, recommended: m.recommendedSkills };
      } catch {
        return null;
      }
    },
    // AFK 运行时就绪探测（R1）：真 execFile docker（超时/spawn 失败降级不抛）+ 凭证注入——
    // 镜像同 afk run 口径（.pipeline/automation.json 的 image ?? sandcastle:local，读 process.cwd()）；
    // 凭证 secretsEnv 走机器级 secrets（readSecrets 自身 fail-open），hostEnv 走 process.env（宿主>文件）；
    // 值永不回显（探针只回 set+source）。docker 缺是常态：doctor checkAfk 据 available 出 yellow 非 red。
    afkReadiness: () => probeAfkReadiness({
      image: readAutomationJson(process.cwd()).image ?? "sandcastle:local",
      secretsEnv: readSecrets(secretsPath(homedir8())).keys,
      hostEnv: process.env
    })
  };
}
async function main() {
  const manifest = loadManifest(manifestPath());
  const { toParse, passthrough } = splitPassthroughArgv(process.argv);
  const deps = {
    store: createStateStore(),
    flow: createFlowEngine(manifest),
    cwd: process.cwd(),
    io: {
      out: (line) => process.stdout.write(`${line}
`),
      err: (line) => process.stderr.write(`${line}
`)
    },
    clock: isoNow,
    listChanges,
    guardCtx: makeGuardCtx(process.cwd()),
    doctor: makeDoctorProbes(),
    readGateMarkers: () => readGateMarkers(process.cwd()),
    writeBreadcrumb: (dir, content) => writeFile10(join35(dir, ".breadcrumb"), content, "utf8"),
    history: createHistoryWriter(),
    // 决策 D（v5 T2）：init 成功后 best-effort 登记项目根到 ~/.claude/pipeline-projects.json
    registerProject: async (repoRoot) => {
      await registerProjectRoot(projectRegistryPath(homedir8()), repoRoot);
    },
    // v6 T2：afk run 凭证注入——机器级 secrets 读成 env 形状（kernel readSecrets 自身 fail-open，
    // 缺失/损坏 → 空 keys）；值不落日志。
    readSecretsEnv: async () => readSecrets(secretsPath(homedir8())).keys,
    readHistoryRaw: async (dir) => {
      try {
        return await readFile7(join35(dir, ".pipeline-history.jsonl"), "utf8");
      } catch {
        return "";
      }
    },
    gitHeadSha: () => gitHeadSha(process.cwd()),
    writeReviewMarker: (content) => writeFile10(join35(process.cwd(), ".pipeline-pending-review"), content, "utf8"),
    pluginVersion: readPluginVersion(),
    readInstalledPlugins: async () => {
      for (const p of [join35(pluginRoot(), "..", "installed_plugins.json"), join35(process.env.HOME ?? "", ".claude", "installed_plugins.json")]) {
        try {
          return await readFile7(p, "utf8");
        } catch {
        }
      }
      return void 0;
    },
    passthroughArgv: passthrough
  };
  try {
    await buildProgram(deps).parseAsync(toParse);
  } catch (e) {
    if (e instanceof CliExit) {
      process.exitCode = e.code;
    } else if (e instanceof CommanderError) {
      process.exitCode = e.exitCode;
    } else {
      process.stderr.write(`ERROR: ${e instanceof Error ? e.message : String(e)}
`);
      process.exitCode = 1;
    }
  }
}
void main();
