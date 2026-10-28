import { fileResponse, handleApi, queryParam } from "../../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const exported = await clm.exportFinance(
      actor,
      { kind: queryParam(request, "kind") ?? "insights" },
      {
        currency: queryParam(request, "currency"),
        vendorId: queryParam(request, "vendorId"),
        statusGroup: queryParam(request, "statusGroup"),
        contractId: queryParam(request, "contractId"),
      },
    );
    return fileResponse({
      bytes: exported.bytes,
      contentType: exported.contentType,
      fileName: exported.fileName,
      disposition: "attachment",
    });
  });
}
