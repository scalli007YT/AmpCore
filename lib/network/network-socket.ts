import dgram, { RemoteInfo, Socket } from "dgram";
import os from "os";
import { TypedEventEmitter } from "@/lib/utils";

export class NetworkSocket extends TypedEventEmitter<{ message: [Buffer, RemoteInfo] }> {
  private started = false;
  private socket: Socket | null = null;

  constructor(
    private readonly recvPort: number,
    private readonly sendPort: number
  ) {
    super();
  }

  async start(): Promise<void> {
    if (this.started) return;

    this.socket = dgram.createSocket("udp4");

    this.socket.on("message", (msg, rinfo) => this.emit("message", msg, rinfo));
    this.socket.on("error", (err) => {
      console.error("error in network adapter " + err);
      this.started = false;
      this.start();
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        this.socket?.removeListener("error", onError);
        reject(err);
      };

      this.socket!.once("error", onError);
      this.socket!.bind({ port: this.recvPort, exclusive: false }, () => {
        this.socket?.removeListener("error", onError);
        this.started = true;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.socket) {
      this.started = false;
      return;
    }

    const socket = this.socket;
    this.socket = null;

    await new Promise<void>((resolve) => {
      socket.close(() => resolve());
    });

    this.started = false;
  }

  async send(
    msg: NodeJS.ArrayBufferView,
    offset: number,
    length: number,
    address: string,
    broadcast: boolean
  ): Promise<number> {
    await this.start();
    this.socket!.setBroadcast(broadcast);

    return new Promise((resolve, reject) => {
      this.socket!.send(msg, offset, length, this.sendPort, address, (error: Error | null, bytes: number) => {
        if (error === null) resolve(bytes);
        else reject(error);
      });
    });
  }

  getNetworkInterfaces() {
    return os.networkInterfaces();
  }
}
