import { handleApi, jsonOk, pageOf, queryParam, readJson } from "../../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const result = await clm.listFinancialTransactions(actor, pageOf(request), {
      contractId: queryParam(request, "contractId"),
      vendorId: queryParam(request, "vendorId"),
      currency: queryParam(request, "currency"),
    });
    return jsonOk(result);
  });
}

export async function POST(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const transaction = await clm.createFinancialTransaction(actor, await readJson(request));
    return jsonOk({ transaction }, 201);
  });
}
