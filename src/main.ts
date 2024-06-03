import { connect } from "cloudflare:sockets";

async function sendCommand(
  writer: WritableStreamDefaultWriter,
  command: string,
  close = false
) {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(command);
  await writer.write(encoded);
  if (close) {
    await writer.close();
  }
}

async function readResponse(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const { value, done } = await reader.read();
  const decoder = new TextDecoder();
  return decoder.decode(value);
}

function isOK(response: string) {
  // POP3 response starts with +OK or -ERR
  return response.startsWith("+OK");
}

function parseEmail(emailText: string) {
  // Split headers and body
  const [headersPart, ...bodyParts] = emailText.split("\r\n\r\n");
  const body = bodyParts.join("\r\n\r\n");

  // Split each line of headers part
  const headersLines = headersPart.split("\r\n");

  // Parse headers
  const headers: { [key: string]: string } = {};
  headersLines.forEach((line) => {
    const [key, ...valueParts] = line.split(": ");
    const value = valueParts.join(": ");
    headers[key] = value;
  });

  // Return parsed email
  return { headers, body };
}

function isBase64Encoded(headers: { [key: string]: string }) {
  console.log(headers["Content-Transfer-Encoding"]);
  return headers["Content-Transfer-Encoding"] === "base64";
}

type Env = {
  USER: string;
  PASS: string;
  HOST: string;
  PORT: string;
};

export default {
  fetch: async (request, env, ctx) => {
    const MAIL_CONFIG = {
      USER: env.USER,
      PASS: env.PASS,
      HOST: env.HOST,
      PORT: Number(env.PORT),
    };
    // Connect to the socket
    const socket = connect(
      { hostname: MAIL_CONFIG.HOST, port: MAIL_CONFIG.PORT },
      { allowHalfOpen: true, secureTransport: "on" }
    );
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();

    // USER command
    let command = `USER ${MAIL_CONFIG.USER}\r\n`;
    console.log(command);
    await sendCommand(writer, command);
    let response = await readResponse(reader);
    console.log(`Command USER response: ${response}`);
    if (!isOK(response)) {
      return new Response(response);
    }

    // PASS command
    command = `PASS ${MAIL_CONFIG.PASS}\r\n`;
    console.log(command);
    await sendCommand(writer, command);
    response = await readResponse(reader);
    console.log(`Command PASS response: ${response}`);
    if (!isOK(response)) {
      return new Response(response);
    }

    // STAT command
    command = `STAT\r\n`;
    console.log(command);
    await sendCommand(writer, command);
    response = await readResponse(reader);
    console.log(`Command STAT response: ${response}`);
    if (!isOK(response)) {
      return new Response(response);
    }

    // LIST command
    command = `LIST\r\n`;
    console.log(command);
    await sendCommand(writer, command);
    response = await readResponse(reader);
    console.log(`Command LIST response: ${response}`);
    if (!isOK(response)) {
      return new Response(response);
    }

    // RETR command
    command = `RETR 1\r\n`;
    console.log(command);
    await sendCommand(writer, command);
    response = await readResponse(reader);
    if (!isOK(response)) {
      return new Response(response);
    }
    let email = parseEmail(response);
    let encodedWord = email.headers["Subject"];
    let matches = encodedWord?.match(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/i);
    if (matches) {
      let charset = matches[1];
      let encoding = matches[2];
      let encodedText = matches[3];
      if (encoding === "B") {
        let data = atob(encodedText);
        let decoder = new TextDecoder("utf-8");
        let uint8Array = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) {
          uint8Array[i] = data.charCodeAt(i);
        }
        let subject = decoder.decode(uint8Array);
        console.log(subject);
      }
    }

    // Close the socket
    socket.close();

    // Return the response
    return new Response(
      JSON.stringify({
        status: "success",
        message: "Mail fetched successfully",
        data: response,
      }),
      {
        headers: { "content-type": "application/json" },
      }
    );
  },
} satisfies ExportedHandler<Env>;
