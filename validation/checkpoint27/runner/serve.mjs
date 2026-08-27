import {createServer} from "node:http";
import {readFile, stat} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = new Map([[".html", "text/html; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"], [".json", "application/json; charset=utf-8"]]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    const requested = url.pathname === "/" ? "/app/" : url.pathname;
    let target = path.resolve(root, `.${requested}`);
    if (!target.startsWith(root)) throw new Error("Ruta inválida");
    if ((await stat(target)).isDirectory()) target = path.join(target, "index.html");
    const data = await readFile(target);
    response.writeHead(200, {"content-type": types.get(path.extname(target)) || "application/octet-stream", "cache-control": "no-store"});
    response.end(data);
  } catch {
    response.writeHead(404, {"content-type": "text/plain; charset=utf-8"});
    response.end("No encontrado");
  }
});

server.listen(4178, "127.0.0.1", () => console.log("IRP-F2 disponible en http://127.0.0.1:4178/app/"));
