const pets = [
  {
    id: 'atlas',
    name: 'Atlas',
    species: 'dog',
    speciesLabel: 'Dog · 3 years',
    age: 'adult',
    energy: 'active',
    energyLabel: 'Curious and active',
    badge: 'Trail-ready',
    blurb: 'A bright-eyed walking companion who loves a steady pace and a good window seat.',
    traits: ['Adult', 'Dog-friendly', 'Outdoor time'],
    token: '•ᴥ•',
    visualLabel: 'Illustration of Atlas, a golden dog',
    palette: { sky: '#b9d7d0', ground: '#789e8b', fur: '#eab968', ear: '#9f673f' },
  },
  {
    id: 'poppy',
    name: 'Poppy',
    species: 'dog',
    speciesLabel: 'Dog · 1 year',
    age: 'young',
    energy: 'playful',
    energyLabel: 'Playful and bright',
    badge: 'People person',
    blurb: 'Soft-hearted, silly, and happiest when a little play is followed by a long nap.',
    traits: ['Young', 'Gentle learner', 'Loves company'],
    token: '•ᴥ•',
    visualLabel: 'Illustration of Poppy, a rust-coloured dog',
    palette: { sky: '#f4d3a2', ground: '#d58a61', fur: '#f5ddbc', ear: '#bd684b' },
  },
  {
    id: 'luna',
    name: 'Luna',
    species: 'cat',
    speciesLabel: 'Cat · 4 years',
    age: 'adult',
    energy: 'gentle',
    energyLabel: 'Gentle and unhurried',
    badge: 'Sunny nap expert',
    blurb: 'A patient, observant cat who turns quiet afternoons into a very good kind of company.',
    traits: ['Adult', 'Calm home', 'Window watcher'],
    token: '=^.^=',
    visualLabel: 'Illustration of Luna, a silver cat',
    palette: { sky: '#c7d4e3', ground: '#829db1', fur: '#ece9df', ear: '#aeb5bd' },
  },
  {
    id: 'miso',
    name: 'Miso',
    species: 'cat',
    speciesLabel: 'Cat · 7 months',
    age: 'kitten',
    energy: 'playful',
    energyLabel: 'Playful and bright',
    badge: 'Tiny comedian',
    blurb: 'A small spark with a big purr, looking for a patient lap and a few good cardboard boxes.',
    traits: ['Kitten', 'Playful', 'Indoor explorer'],
    token: '=^.^=',
    visualLabel: 'Illustration of Miso, a ginger kitten',
    palette: { sky: '#f5d7a8', ground: '#ca8562', fur: '#e8a85d', ear: '#c27343' },
  },
  {
    id: 'clover',
    name: 'Clover',
    species: 'small',
    speciesLabel: 'Rabbit · 2 years',
    age: 'young',
    energy: 'gentle',
    energyLabel: 'Gentle and unhurried',
    badge: 'Garden soul',
    blurb: 'A quiet, curious rabbit who likes a softly lit room, leafy greens, and patient friends.',
    traits: ['Young', 'Quiet home', 'Gentle handling'],
    token: 'ᵔᴥᵔ',
    visualLabel: 'Illustration of Clover, a cream rabbit',
    palette: { sky: '#d7e3bc', ground: '#89a56f', fur: '#f1ead6', ear: '#cba88d' },
  },
  {
    id: 'wren',
    name: 'Wren',
    species: 'cat',
    speciesLabel: 'Cat · 2 years',
    age: 'young',
    energy: 'active',
    energyLabel: 'Curious and active',
    badge: 'Shelf inspector',
    blurb: 'A nimble little roommate with an investigative streak and a talent for making you laugh.',
    traits: ['Young', 'Smart play', 'Confident'],
    token: '=^.^=',
    visualLabel: 'Illustration of Wren, a dark tabby cat',
    palette: { sky: '#d1d1c1', ground: '#859078', fur: '#8c7f6a', ear: '#62594d' },
  },
];

const filterForm = document.querySelector('#filters-form');
const speciesFilter = document.querySelector('#species-filter');
const ageFilter = document.querySelector('#age-filter');
const energyFilter = document.querySelector('#energy-filter');
const resetFiltersButton = document.querySelector('#reset-filters');
const emptyResetButton = document.querySelector('#empty-reset');
const petGrid = document.querySelector('#pet-grid');
const emptyState = document.querySelector('#empty-state');
const resultsStatus = document.querySelector('#results-status');
const applicationForm = document.querySelector('#application-form');
const applicationContext = document.querySelector('#application-context');
const applicationErrors = document.querySelector('#application-errors');
const applicationSuccess = document.querySelector('#application-success');
const applicantName = document.querySelector('#applicant-name');
const applicantEmail = document.querySelector('#applicant-email');
const homeRhythm = document.querySelector('#home-rhythm');
const generalApplicationButton = document.querySelector('#start-general-application');

let selectedPet = null;

function matchesFilters(pet) {
  return (
    (speciesFilter.value === 'all' || pet.species === speciesFilter.value) &&
    (ageFilter.value === 'all' || pet.age === ageFilter.value) &&
    (energyFilter.value === 'all' || pet.energy === energyFilter.value)
  );
}

function createPetCard(pet) {
  const card = document.createElement('article');
  card.className = 'pet-card';
  card.dataset.petCard = pet.id;

  const portrait = document.createElement('div');
  portrait.className = 'pet-portrait';
  portrait.setAttribute('role', 'img');
  portrait.setAttribute('aria-label', pet.visualLabel);
  portrait.style.setProperty('--pet-sky', pet.palette.sky);
  portrait.style.setProperty('--pet-ground', pet.palette.ground);
  portrait.style.setProperty('--pet-fur', pet.palette.fur);
  portrait.style.setProperty('--pet-ear', pet.palette.ear);

  const token = document.createElement('span');
  token.className = pet.species === 'small' ? 'pet-token pet-token-small' : 'pet-token';
  token.setAttribute('aria-hidden', 'true');
  token.textContent = pet.token;
  portrait.append(token);

  const content = document.createElement('div');
  content.className = 'pet-card-content';

  const topline = document.createElement('div');
  topline.className = 'pet-card-topline';
  const nameBlock = document.createElement('div');
  const name = document.createElement('h3');
  name.textContent = pet.name;
  const species = document.createElement('p');
  species.className = 'pet-type';
  species.textContent = pet.speciesLabel;
  nameBlock.append(name, species);
  const badge = document.createElement('span');
  badge.className = 'match-badge';
  badge.textContent = pet.badge;
  topline.append(nameBlock, badge);

  const blurb = document.createElement('p');
  blurb.className = 'pet-blurb';
  blurb.textContent = pet.blurb;
  const details = document.createElement('ul');
  details.className = 'pet-details';
  [pet.energyLabel, ...pet.traits].forEach((trait) => {
    const detail = document.createElement('li');
    detail.textContent = trait;
    details.append(detail);
  });

  const applyButton = document.createElement('button');
  applyButton.className = 'button button-quiet';
  applyButton.type = 'button';
  applyButton.dataset.applyFor = pet.id;
  applyButton.textContent = `Start an introduction for ${pet.name}`;

  content.append(topline, blurb, details, applyButton);
  card.append(portrait, content);
  return card;
}

function describeResults(resultCount) {
  if (resultCount === 0) {
    return 'No companions match those filters. You can reset them to see every sample profile.';
  }

  const companionLabel = resultCount === 1 ? 'companion matches' : 'companions match';
  return `${resultCount} ${companionLabel} your filters.`;
}

function renderPets() {
  const matchingPets = pets.filter(matchesFilters);
  petGrid.replaceChildren(...matchingPets.map(createPetCard));
  petGrid.hidden = matchingPets.length === 0;
  emptyState.hidden = matchingPets.length !== 0;
  resultsStatus.textContent = describeResults(matchingPets.length);
}

function resetFilters({ focusFilter = false } = {}) {
  filterForm.reset();
  renderPets();

  if (focusFilter) {
    speciesFilter.focus();
  }
}

function clearApplicationError(control) {
  control.removeAttribute('aria-invalid');

  if (applicationErrors.hidden) {
    return;
  }

  const invalidControls = [applicantName, applicantEmail, homeRhythm].filter(
    (formControl) => !formControl.checkValidity(),
  );

  if (invalidControls.length === 0) {
    applicationErrors.hidden = true;
    applicationErrors.replaceChildren();
    return;
  }

  showApplicationErrors(invalidControls, { moveFocus: false });
}

function startApplication(pet) {
  selectedPet = pet;
  applicationSuccess.hidden = true;
  applicationSuccess.textContent = '';

  if (pet === null) {
    applicationContext.textContent = 'Tell us a little about your home rhythm.';
  } else {
    applicationContext.textContent = `A gentle introduction for ${pet.name} starts here.`;
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelector('#apply').scrollIntoView({
    behavior: reduceMotion ? 'auto' : 'smooth',
    block: 'start',
  });
  window.setTimeout(() => applicantName.focus(), 220);
}

function showApplicationErrors(invalidControls, { moveFocus = true } = {}) {
  const labels = {
    'applicant-name': 'Enter your name.',
    'applicant-email': 'Enter a valid email address.',
    'home-rhythm': 'Choose what home feels like.',
  };
  const list = document.createElement('ul');

  invalidControls.forEach((control) => {
    control.setAttribute('aria-invalid', 'true');
    const item = document.createElement('li');
    item.textContent = labels[control.id];
    list.append(item);
  });

  applicationErrors.replaceChildren('Please review the highlighted fields.', list);
  applicationErrors.hidden = false;

  if (moveFocus) {
    applicationErrors.focus();
  }
}

function submitApplication(event) {
  event.preventDefault();
  const requiredControls = [applicantName, applicantEmail, homeRhythm];
  const invalidControls = requiredControls.filter((control) => !control.checkValidity());

  if (invalidControls.length > 0) {
    showApplicationErrors(invalidControls);
    return;
  }

  requiredControls.forEach((control) => control.removeAttribute('aria-invalid'));
  applicationErrors.hidden = true;
  applicationErrors.replaceChildren();
  const companionName = selectedPet?.name ?? 'a companion';
  applicationSuccess.textContent = `Your local introduction for ${companionName} is complete. Nothing was sent to a shelter or stored.`;
  applicationSuccess.hidden = false;
  applicationSuccess.focus();
}

filterForm.addEventListener('change', renderPets);
resetFiltersButton.addEventListener('click', () => resetFilters({ focusFilter: true }));
emptyResetButton.addEventListener('click', () => resetFilters({ focusFilter: true }));
petGrid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-apply-for]');

  if (button === null) {
    return;
  }

  const pet = pets.find((candidate) => candidate.id === button.dataset.applyFor) ?? null;
  startApplication(pet);
});
generalApplicationButton.addEventListener('click', () => startApplication(null));
applicationForm.addEventListener('submit', submitApplication);
[applicantName, applicantEmail, homeRhythm].forEach((control) => {
  control.addEventListener('input', () => clearApplicationError(control));
  control.addEventListener('change', () => clearApplicationError(control));
});

renderPets();
