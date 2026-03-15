import { RemoteInfo } from "dgram";
import { NetworkSocket } from "@/lib/network/network-socket";
import { TypedEventEmitter } from "@/lib/utils";

export class NetworkAdapter extends TypedEventEmitter<{ message: [Buffer, RemoteInfo] }> {
  private networkSocket: NetworkSocket;

  constructor() {
    super();
    this.networkSocket = new NetworkSocket(45454, 45455);
    this.networkSocket.on("message", (buffer, rinfo) => this.onReceivePacket(buffer, rinfo));
  }

  async start() {
    await this.networkSocket.start();
  }

  async stop() {
    await this.networkSocket.stop();
  }

  async getNetworkInterfaces() {
    return this.networkSocket.getNetworkInterfaces();
  }

  /**
   * @deprecated Use `sendPacket` instead.
   */
  async sendRaw_shouldBeReplacedWithSendPacket(
    msg: NodeJS.ArrayBufferView,
    offset: number,
    length: number,
    address: string,
    broadcast: boolean
  ) {
    return await this.networkSocket.send(msg, offset, length, address, broadcast);
  }

  /**
   * @todo implement
   */
  async sendPacket(packet: object, address: string) {}

  /**
   * @todo implement
   */
  async broadcastPacket(packet: object) {}

  private onReceivePacket(buffer: Buffer, rinfo: RemoteInfo) {
    // todo: change to handle packets here, only emit structured packet info
    this.emit("message", buffer, rinfo);
  }

  /**
   * @deprecated Use `on(<packetName>, listener)` instead.
   */
  on(event: "message", listener: (...args: [Buffer, RemoteInfo]) => void): this {
    super.on(event, listener);
    return this;
  }
}
