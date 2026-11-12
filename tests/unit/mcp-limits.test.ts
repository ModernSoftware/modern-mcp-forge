import { expect, test } from "bun:test";
import { forgeMcpHandler } from "$lib/server/mcp/handler";

test("MCP body limit rejects declared and streamed bodies before creating a project server", async () => {
  for (const streamed of [false, true]) {
    const body = new TextEncoder().encode(
      JSON.stringify({ padding: "x".repeat(1024 * 1024) }),
    );
    const response = await forgeMcpHandler.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...(streamed ? {} : { "content-length": String(body.length) }),
        },
        body: streamed
          ? new ReadableStream({
              start(controller) {
                controller.enqueue(body.subarray(0, 500_000));
                controller.enqueue(body.subarray(500_000));
                controller.close();
              },
            })
          : body,
      }),
    );
    expect(response.status).toBe(413);
  }
});
