import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { EventEmitter } from "events";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export class TypedEventEmitter<NetworkEmitter extends { [key: string | symbol]: unknown[] }> extends EventEmitter {
  emit<K extends keyof NetworkEmitter>(event: K, ...args: NetworkEmitter[K]): boolean {
    return super.emit(event as string | symbol, ...args);
  }
  on<K extends keyof NetworkEmitter>(event: K, listener: (...args: NetworkEmitter[K]) => void): this {
    super.on(event as string | symbol, listener);
    return this;
  }
  once<K extends keyof NetworkEmitter>(event: K, listener: (...args: NetworkEmitter[K]) => void): this {
    super.once(event as string | symbol, listener);
    return this;
  }
  removeListener<K extends keyof NetworkEmitter>(event: K, listener: (...args: NetworkEmitter[K]) => void): this {
    super.removeListener(event as string | symbol, listener);
    return this;
  }
}
