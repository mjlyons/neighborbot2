// test-eslint.ts

// This should trigger @typescript-eslint/no-floating-promises
async function floatingPromiseExample() {
  doAsyncThing(); // ❌ Should error: unhandled promise
}

// This should be fine
async function handledPromiseExample() {
  await doAsyncThing(); // ✅ OK
}

// This should trigger @typescript-eslint/no-misused-promises
function misusedPromiseInCondition() {
  if (checkSomethingAsync()) {
    // ❌ Should error: passing a Promise to an if
    console.log('This should never happen.');
  }
}

// This should be fine
async function properlyAwaitedCondition() {
  if (await checkSomethingAsync()) {
    // ✅ OK
    console.log('Condition met.');
  }
}

// Example for simple-import-sort (if you have another file, you can test sorting)
// import { anotherFunc } from './anotherFile';

// Fake async functions
async function doAsyncThing(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 100));
}

async function checkSomethingAsync(): Promise<boolean> {
  return new Promise((resolve) => setTimeout(() => resolve(true), 100));
}
