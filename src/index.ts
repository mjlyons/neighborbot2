import { Command } from 'commander';

const program = new Command();

program
  .name('neighborbot')
  .description('Organizes recommendations from neighborhood Whatsapp groups')
  .version('1.0.0');

const main = async () => {
  program.parse(process.argv);
};

main();
