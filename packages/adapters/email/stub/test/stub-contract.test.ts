import { StubEmailAdapter } from "@plinth/adapter-email-stub";
import { runEmailContractTests } from "@plinth/contract-tests";

runEmailContractTests({
  adapterName: "StubEmailAdapter (Local Catcher)",
  createAdapter: () => new StubEmailAdapter(),
});
