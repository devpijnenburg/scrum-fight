const PLAN_LIMITS = {
  free: {
    maxRooms: 3,
    maxParticipants: 5,
    retentionDays: 30,
  },
  pro: {
    maxRooms: 20,
    maxParticipants: 15,
    retentionDays: 30,
  },
  premium: {
    maxRooms: Infinity,
    maxParticipants: Infinity,
    retentionDays: null, // no automatic deletion
  },
};

const ESTIMATION_METHODS = {
  fibonacci: {
    label: 'Fibonacci 😊',
    values: ['😊', '1', '2', '3', '5', '8', '13', '21', '34', '?', '☕'],
  },
  modified_fibonacci: {
    label: 'Modified Fibonacci',
    values: ['0', '½', '1', '2', '3', '5', '8', '13', '20', '40', '100', '?', '☕'],
  },
  tshirt: {
    label: 'T-shirt maten',
    values: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '?'],
  },
  powers_of_2: {
    label: 'Powers of 2',
    values: ['1', '2', '4', '8', '16', '32', '64', '?', '☕'],
  },
};

const VALID_METHODS = Object.keys(ESTIMATION_METHODS);

module.exports = { PLAN_LIMITS, ESTIMATION_METHODS, VALID_METHODS };
