import { sampleArguments } from './sample-arguments';

self.onmessage = (event: MessageEvent<string>) => {
  self.postMessage(sampleArguments(JSON.parse(event.data)));
};
