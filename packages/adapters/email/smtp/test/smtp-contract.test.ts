import { SmtpEmailAdapter } from "@plinth/adapter-email-smtp";
import { runEmailContractTests } from "@plinth/contract-tests";
import nodemailer from "nodemailer";

const jsonTransporter = nodemailer.createTransport({
  jsonTransport: true,
});

runEmailContractTests({
  adapterName: "SmtpEmailAdapter (nodemailer jsonTransport)",
  createAdapter: () =>
    new SmtpEmailAdapter({
      transporter: jsonTransporter,
      defaultFrom: "system@plinth.dev",
    }),
});
