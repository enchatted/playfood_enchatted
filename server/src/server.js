// Ο έλεγχος ΠΡΕΠΕΙ να τρέξει πριν φορτωθεί οτιδήποτε αγγίζει better-sqlite3.
// Γι' αυτό το πραγματικό app έρχεται με ΔΥΝΑΜΙΚΟ import: τα static imports θα
// είχαν αξιολογηθεί πριν από αυτή τη γραμμή και ο έλεγχος δεν θα προλάβαινε.
const MAJOR = Number(process.versions.node.split('.')[0]);
if (MAJOR < 22 || MAJOR >= 27) {
  console.error(
    `\n  PLAYFOOD: Node >=22 and <27 required — you have ${process.versions.node}\n` +
    `  Run "nvm install" and "nvm use" from the project root, then try again.\n`
  );
  process.exit(1);
}

const { buildServer, getPort } = await import('./app.js');

try {
  const fastify = await buildServer();
  const port = getPort();
  await fastify.listen({ port, host: '0.0.0.0' });
  console.log(`PLAYFOOD running on http://localhost:${port}  ·  panel: /panel`);
} catch (err) {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n  PLAYFOOD: port ${getPort()} is already in use.\n` +
      `  Stop whatever else is using it — often an earlier copy of this server that\n` +
      `  didn't shut down cleanly — then run this again. To use a different port\n` +
      `  instead, change PORT in playfood.config.txt.\n`
    );
  } else if (err.code === 'EACCES') {
    console.error(
      `\n  PLAYFOOD: permission denied binding to port ${getPort()}.\n` +
      `  Ports below 1024 usually require administrator rights. Pick a port above\n` +
      `  1024 in playfood.config.txt, or run this with the required privileges.\n`
    );
  } else {
    console.error(
      `\n  PLAYFOOD: the server failed to start.\n` +
      `  ${err.message}\n`
    );
  }
  process.exit(1);
}
