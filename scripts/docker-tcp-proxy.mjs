/**
 * Publishes the host Docker daemon on the loopback interface.
 *
 * The application image build prepares the Eve sandbox template, and that
 * preparation needs a Docker daemon. BuildKit resolves the source of a bind
 * mount against the build context, so a host socket cannot be mounted into a
 * build step. The daemon is published over TCP instead, and the build reaches
 * it through DOCKER_HOST on the host network.
 *
 * The daemon grants control of the host, so the proxy listens on the loopback
 * interface only and is meant to run for the lifetime of one build.
 */
import { connect, createServer } from "node:net";

const socketPath = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock";
const port = Number(process.env.DOCKER_TCP_PORT ?? "2375");

const server = createServer((client) => {
  const daemon = connect({ path: socketPath });
  client.pipe(daemon);
  daemon.pipe(client);
  const close = () => {
    client.destroy();
    daemon.destroy();
  };
  client.on("error", close);
  daemon.on("error", close);
});

server.on("error", (error) => {
  console.error("The Docker daemon proxy could not start: " + error.message);
  process.exit(1);
});

server.listen(port, "127.0.0.1", () => {
  console.log("Docker daemon published on 127.0.0.1:" + port);
});
