const server = Bun.serve({
    port: 3000,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/") return new Response("Welcome to my Bun API!");
      if (url.pathname === "/api/hello") return new Response("Hello, World!");
      return new Response("Not Found", { status: 404 });
    },
  });
  
  console.log(`Listening on http://localhost:${server.port}`);