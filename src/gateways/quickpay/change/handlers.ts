import { PoolClient } from "pg";
import {
  ChargeStatus,
  insertInitialChargeQuickpay,
  QuickpayChange,
  setChargeWithGatewayResponseByShortId,
} from "src";

async function handleSubscription(db: PoolClient, change: QuickpayChange) {
  if (!change.accepted) {
    return;
  }

  if (process.env.VERCEL_ENV === "production" && change.test_mode) {
    console.error(
      `Quickpay subscription ${change.order_id} was paid using test card, ignoring.`
    );
    return;
  }

  console.log(
    `Creating initial charges for Quickpay subscription ${change.order_id}`
  );
  await insertInitialChargeQuickpay(db, change.order_id);
}

/** Add gateway response to a charge */
async function handleCharge(db: PoolClient, change: QuickpayChange) {
  const status = getChargeStatusFromOperations(change);
  if (status) {
    console.log(`Charge ${change.order_id} is now ${status} with Quickpay`);
    await setChargeWithGatewayResponseByShortId(db, {
      status,
      short_id: change.order_id,
      gateway_response: { operations: change.operations },
    });
  }
}

/** run appropriate handler based on change type */
export async function quickpayHandleChange(
  db: PoolClient,
  change: QuickpayChange
) {
  switch (change.type) {
    case "Payment":
      return await handleCharge(db, change);
    case "Subscription":
      return await handleSubscription(db, change);
  }
}

const getChargeStatusFromOperations = (change: QuickpayChange) => {
  if (change.operations.length < 1) {
    return null;
  }

  const latest = change.operations?.sort((a, b) => b.id - a.id)[0];

  switch (latest.qp_status_code) {
    case "40000":
      return ChargeStatus.Error;
    case "20000":
      switch (latest.type) {
        case "capture":
          return ChargeStatus.Charged;
        case "refund":
          return ChargeStatus.Refunded;
      }
  }
  return null;
};
