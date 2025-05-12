import { Command } from 'commander';

const program = new Command();

program
  .name('neighborbot')
  .description('Organizes recommendations from neighborhood Whatsapp groups')
  .version('1.0.0');

const main = async (): Promise<void> => {
  program.parse(process.argv);
};

main().catch(console.error);
