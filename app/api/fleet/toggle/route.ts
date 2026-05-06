import { NextRequest, NextResponse } from "next/server";

const LOCATIONS_COL = "69a747a2f58a483fb1f6db2a";
const WEBFLOW_TOKEN =
  "76d8a562c65a1da1477a8fcc8c3a7506507e577c83e6f21d0a1202bf9b779634";

type ToggleUpdate = { locationId: string; isLive: boolean };

async function patchLocation(locationId: string, isLive: boolean) {
  const response = await fetch(
    `https://api.webflow.com/v2/collections/${LOCATIONS_COL}/items/${locationId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${WEBFLOW_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fieldData: { "is-live": isLive } }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Patch failed: ${response.status} ${await response.text()}`);
  }
}

async function publishItems(itemIds: string[]) {
  if (itemIds.length === 0) return;
  const response = await fetch(`https://api.webflow.com/v2/collections/${LOCATIONS_COL}/items/publish`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WEBFLOW_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ itemIds }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Publish failed: ${response.status} ${await response.text()}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { updates?: ToggleUpdate[] };
    const updates = body.updates ?? [];
    if (updates.length === 0) {
      return NextResponse.json({ success: true });
    }

    for (const update of updates) {
      await patchLocation(update.locationId, update.isLive);
    }
    await publishItems(updates.map((item) => item.locationId));

    return NextResponse.json({ success: true, updated: updates.length });
  } catch (error) {
    return new NextResponse(error instanceof Error ? error.message : "Toggle failed", {
      status: 500,
    });
  }
}
