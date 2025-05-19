// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const startREPL = async (context: Record<string, any>): Promise<void> => {
  // Start a REPL session
  const repl = await import('repl');
  const replServer = repl.start({
    prompt: 'neighborbot> ',
    useColors: true,
  });

  Object.assign(replServer.context, context);

  console.log('\n=== Welcome to the NeighborBot REPL! ===');
  console.log('\nAvailable objects in context:');
  for (const [key, value] of Object.entries(context)) {
    console.log(`- ${key}: ${value?.constructor?.name ?? typeof value}`);
  }
};
