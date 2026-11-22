// Random, friendly room names ("Cosmic Narwhal Sprint").

const ADJECTIVES = [
  'Fluffy', 'Cosmic', 'Epic', 'Ninja', 'Turbo', 'Legendary', 'Quantum', 'Sneaky',
  'Blazing', 'Mysterious', 'Glittery', 'Thunderous', 'Magical', 'Hyper', 'Radical',
  'Zesty', 'Wobbly', 'Sparkly', 'Grumpy', 'Jolly', 'Speedy', 'Funky', 'Mighty',
];
const NOUNS = [
  'Unicorn', 'Dragon', 'Penguin', 'Elephant', 'Phoenix', 'Narwhal', 'Llama',
  'Gecko', 'Panda', 'Kraken', 'Platypus', 'Hamster', 'Octopus', 'Dinosaur', 'Giraffe',
  'Axolotl', 'Capybara', 'Quokka', 'Meerkat', 'Sloth', 'Dodo',
];
const SUFFIXES = ['Sprint', 'Planning', 'Refinement', 'Poker', 'Session'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function generateRoomName() {
  return `${pick(ADJECTIVES)} ${pick(NOUNS)} ${pick(SUFFIXES)}`;
}
