import { FastifyHttpAdapter } from "@plinth/adapter-http-fastify";
import { type HttpAdapterOptions, runHttpContractTests } from "@plinth/contract-tests";

runHttpContractTests({
  adapterName: "FastifyHttpAdapter",
  createServer: (options?: HttpAdapterOptions) => new FastifyHttpAdapter(options),
});
