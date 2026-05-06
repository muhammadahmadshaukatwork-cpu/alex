import { NextResponse } from "next/server";

const SITE_ID = "699f24e36021db019f687184";
const DRIVERS_COL = "69a1e72f63393d97c8998eed";
const STATUSES_COL = "69a1e899a080096c6cf3038b";
const LOCATIONS_COL = "69a747a2f58a483fb1f6db2a";
const SERVICES_COL = "69b82fe889560245d1891ea4";
const WEBFLOW_TOKEN =
  "76d8a562c65a1da1477a8fcc8c3a7506507e577c83e6f21d0a1202bf9b779634";

async function webflowGet(path: string) {
  const response = await fetch(`https://api.webflow.com${path}`, {
    headers: {
      Authorization: `Bearer ${WEBFLOW_TOKEN}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Webflow GET failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

export async function GET() {
  try {
    const [drivers, statuses, locations, services] = await Promise.all([
      webflowGet(`/v2/sites/${SITE_ID}/collections/${DRIVERS_COL}/items?limit=100`),
      webflowGet(`/v2/sites/${SITE_ID}/collections/${STATUSES_COL}/items?limit=100`),
      webflowGet(`/v2/sites/${SITE_ID}/collections/${LOCATIONS_COL}/items?limit=100`),
      webflowGet(`/v2/sites/${SITE_ID}/collections/${SERVICES_COL}/items?limit=100`),
    ]);

    return NextResponse.json({
      drivers: drivers.items ?? [],
      statuses: statuses.items ?? [],
      locations: locations.items ?? [],
      services: services.items ?? [],
    });
  } catch (error) {
    return new NextResponse(error instanceof Error ? error.message : "Request failed", {
      status: 500,
    });
  }
}
