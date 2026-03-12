import dgram from "dgram";
import os from "os";

export type DatagramSocket = dgram.Socket;
export type DatagramRemoteInfo = dgram.RemoteInfo;

export function createSocket() {
    return dgram.createSocket("udp4");
}

export function getNetworkInterfaces() {
    return os.networkInterfaces();
}
