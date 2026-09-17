import { hash } from 'argon2';

async function hiddenPrompt(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Run this command in an interactive terminal.');
  }
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      process.stdout.write('\n');
    };
    const onData = (key) => {
      if (key === '\u0003') {
        cleanup();
        reject(new Error('Cancelled.'));
      } else if (key === '\r' || key === '\n') {
        cleanup();
        resolve(value);
      } else if (key === '\u007f' || key === '\b') {
        value = value.slice(0, -1);
      } else if (/^[\x20-\x7E]+$/.test(key)) {
        value += key;
      }
    };
    process.stdin.on('data', onData);
  });
}

try {
  const first = await hiddenPrompt('New Research Lab password: ');
  const second = await hiddenPrompt('Confirm password: ');
  if (first.length < 12)
    throw new Error(
      'Use at least 12 characters. A longer passphrase is recommended.',
    );
  if (first !== second) throw new Error('Passwords do not match.');
  const encoded = await hash(first, {
    type: 2,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  });
  process.stdout.write('\nSet this server-only environment value:\n\n');
  process.stdout.write(`HYDRONEXUS_RESEARCH_PASSWORD_HASH=${encoded}\n`);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Unable to create password hash.'}\n`,
  );
  process.exitCode = 1;
}
