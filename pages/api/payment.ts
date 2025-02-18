import type { NextApiRequest, NextApiResponse } from "next";
import {
  parsePaymentMethod,
  PaymentGateway,
  PaymentMethod,
  processBankTransferPayment,
  processQuickpayPayment,
  processScanpayPayment,
  SubmitData,
  validationSchema,
} from "src";
import * as yup from "yup";

type Data = {
  message: string;
  redirect?: string;
  bank?: { account: string; message: string };
};

const firstElementOrString = (x: any) => {
  if (typeof x === "object") {
    return x[0];
  } else {
    return x;
  }
};

/**
 * 1. Creates donor record and maybe donor subscription, charges, membership, payment or bank_transfer
 * 2. Requests link from payment gateway for credit card or MobilePay, otherwise returns bank transfer info
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  try {
    // Trust the usual proxy headers (assumes we are running on a reverse proxy that promises to overwrite these values).
    const ip: string =
      firstElementOrString(req.headers["x-real-ip"]) ||
      firstElementOrString(req.headers["x-forwarded-for"]) ||
      req.socket.remoteAddress ||
      "no ip";

    let submitData: SubmitData = await yup
      .object()
      .shape(validationSchema)
      .validate(req.body);

    switch (parsePaymentMethod(submitData.method)) {
      case PaymentMethod.BankTransfer:
        const bankTransferId = await processBankTransferPayment(submitData);
        res.status(200).json({
          message: "OK",
          bank: {
            account: "5351-0242661",
            message: `d-${bankTransferId}`,
          },
        });
        return;

      case PaymentMethod.CreditCard:
      case PaymentMethod.MobilePay:
        switch (process.env.PAYMENT_GATEWAY) {
          case PaymentGateway.Quickpay:
            res.status(200).json({
              message: "OK",
              redirect: await processQuickpayPayment(submitData),
            });
            return;

          case PaymentGateway.Scanpay:
            res.status(200).json({
              message: "OK",
              redirect: await processScanpayPayment(submitData, ip),
            });
            return;

          default:
            console.error(
              `api/payment: PAYMENT_GATEWAY '${process.env.PAYMENT_GATEWAY}' is unable to process payment method '${submitData.method}'`
            );
            res.status(400).json({
              message: `Unsupported payment method '${submitData.method}'`,
            });
            return;
        }
    }
  } catch (err) {
    console.error("api/payment:", err);
    res.status(500).json({ message: "Something went wrong" });
  }
}
