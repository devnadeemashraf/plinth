import { ExpressHttpAdapter } from "@plinth/adapter-http-express";
import { type HttpAdapterOptions, runHttpContractTests } from "@plinth/contract-tests";

runHttpContractTests({
  adapterName: "ExpressHttpAdapter",
  createServer: (options?: HttpAdapterOptions) => new ExpressHttpAdapter(options),
});
