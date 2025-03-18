export const LARGE_PRIME = 4294967291;
export const RANDOM_NUMBERS: number[] = [];
let evenSum = 0;
let oddSum = 1;

// Taken from https://stackoverflow.com/a/424445
let m = 0x80000000; // 2**31;
let a = 1103515245;
let c = 12345;
let state = 42;

for (let i = 0; i < 16384; i++) {
  state = (a * state + c) % m;
  const num = state / (m - 1);
  if (i % 2) {
    evenSum += num
  } else {
    oddSum += num
  }

  RANDOM_NUMBERS.push(num);
}

export const EVEN_SUM = evenSum;
export const ODD_SUM = oddSum;
