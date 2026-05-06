"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

type Driver = { id: string; fieldData: Record<string, unknown> };
type Location = { id: string; fieldData: Record<string, unknown> };
type Service = { id: string; fieldData: Record<string, unknown> };
type Status = { id: string; fieldData: Record<string, unknown> };

type FleetPayload = {
  drivers: Driver[];
  locations: Location[];
  services: Service[];
  statuses: Status[];
};

const CREDS = { email: "admin@fleet.com", password: "fleet2024" };
const STATUS_COLORS: Record<string, string> = {
  approved: "#3fb950",
  pending: "#f0883e",
  suspend: "#f85149",
};

const classForStatus = (name: string) => {
  if (name.toLowerCase() === "approved") return "status-approved";
  if (name.toLowerCase() === "pending") return "status-pending";
  return "status-suspend";
};

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((chunk) => chunk[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

function asString(v: unknown) {
  return typeof v === "string" ? v : "";
}

function asBool(v: unknown) {
  return v === true;
}

function InsightIcon({
  tone,
  children,
}: {
  tone: "blue" | "green" | "amber" | "purple";
  children: React.ReactNode;
}) {
  return <span className={`fd-insight-icon ${tone}`}>{children}</span>;
}

function DriverAvatar({
  name,
  src,
  large = false,
}: {
  name: string;
  src?: string;
  large?: boolean;
}) {
  const [hasError, setHasError] = useState(false);
  const imageSrc = src?.trim() ?? "";

  if (imageSrc && !hasError) {
    const size = large ? 72 : 32;
    return (
      <Image
        src={imageSrc}
        alt={name}
        width={size}
        height={size}
        unoptimized
        className={`fd-avatar ${large ? "large" : ""}`}
        onError={() => setHasError(true)}
      />
    );
  }

  return <div className={`fd-avatar ${large ? "large" : ""}`}>{initials(name || "U")}</div>;
}

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const [payload, setPayload] = useState<FleetPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"drivers" | "insights">("drivers");

  const statusMap = useMemo(() => {
    const map: Record<string, string> = {};
    (payload?.statuses ?? []).forEach((status) => {
      map[status.id] = asString(status.fieldData.name) || "Unknown";
    });
    return map;
  }, [payload]);

  const servicesMap = useMemo(() => {
    const map: Record<string, string> = {};
    (payload?.services ?? []).forEach((service) => {
      map[service.id] =
        asString(service.fieldData["service-name"]) ||
        asString(service.fieldData.name) ||
        "Unknown";
    });
    return map;
  }, [payload]);

  const locationMap = useMemo(() => {
    const map: Record<string, Location> = {};
    (payload?.locations ?? []).forEach((location) => {
      const driverId = asString(location.fieldData.driver);
      if (driverId) {
        map[driverId] = location;
      }
    });
    return map;
  }, [payload]);

  const filteredDrivers = useMemo(() => {
    const q = search.toLowerCase();
    return (payload?.drivers ?? []).filter((driver) => {
      const name = asString(driver.fieldData.name).toLowerCase();
      const company = asString(driver.fieldData["company-name-2"]).toLowerCase();
      const base = asString(driver.fieldData["base-area-2"]).toLowerCase();
      return name.includes(q) || company.includes(q) || base.includes(q);
    });
  }, [payload, search]);

  const selectedDriver = useMemo(
    () => payload?.drivers.find((driver) => driver.id === selectedDriverId) ?? null,
    [payload, selectedDriverId],
  );

  const onlineCount = useMemo(
    () =>
      (payload?.drivers ?? []).filter((driver) =>
        asBool(locationMap[driver.id]?.fieldData["is-live"]),
      ).length,
    [payload, locationMap],
  );

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/fleet/data");
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as FleetPayload;
      setPayload(data);
      if (!selectedDriverId && data.drivers[0]) {
        setSelectedDriverId(data.drivers[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const onLogin = async () => {
    if (CREDS.email !== email.trim().toLowerCase() || CREDS.password !== password) {
      setAuthError("Invalid credentials");
      return;
    }
    setAuthError("");
    setLoggedIn(true);
    await loadData();
  };

  const toggleOne = async (driverId: string, makeLive: boolean) => {
    const location = locationMap[driverId];
    if (!location) return;

    setUpdatingIds((prev) => new Set(prev).add(driverId));
    try {
      const response = await fetch("/api/fleet/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: [{ locationId: location.id, isLive: makeLive }] }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }

      setPayload((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          locations: prev.locations.map((locationRow) =>
            locationRow.id === location.id
              ? {
                  ...locationRow,
                  fieldData: { ...locationRow.fieldData, "is-live": makeLive },
                }
              : locationRow,
          ),
        };
      });
    } catch {
      alert("Unable to update this driver right now.");
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(driverId);
        return next;
      });
    }
  };

  const bulkSetOnline = async (makeLive: boolean) => {
    const updates = [...selectedIds]
      .map((driverId) => locationMap[driverId])
      .filter(Boolean)
      .filter((location) => asBool(location.fieldData["is-live"]) !== makeLive)
      .map((location) => ({
        locationId: location.id,
        isLive: makeLive,
      }));

    if (updates.length === 0) {
      setSelectedIds(new Set());
      return;
    }

    const busy = new Set(selectedIds);
    setUpdatingIds((prev) => new Set([...prev, ...busy]));
    try {
      const response = await fetch("/api/fleet/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }

      setPayload((prev) => {
        if (!prev) return prev;
        const changes = new Map(updates.map((u) => [u.locationId, u.isLive]));
        return {
          ...prev,
          locations: prev.locations.map((location) =>
            changes.has(location.id)
              ? {
                  ...location,
                  fieldData: {
                    ...location.fieldData,
                    "is-live": changes.get(location.id),
                  },
                }
              : location,
          ),
        };
      });
      setSelectedIds(new Set());
    } catch {
      alert("Bulk update failed. Please retry.");
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        busy.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  if (!loggedIn) {
    return (
      <main className="fd-login-root">
        <section className="fd-login-brand">
          <div>
            <div className="fd-logo-wrap">
              <div className="fd-logo-mark">C</div>
              <p>Call A Van</p>
            </div>
            <h1>
              Driver operations.
              <br />
              <span>Minimal. Fast. Controlled.</span>
            </h1>
          </div>
          <small>Call A Van Admin v2</small>
        </section>
        <section className="fd-login-panel">
          <div className="fd-card">
            <h2>Sign in</h2>
            <p>Secure admin access</p>
            <label>
              Email
              <input
                type="email"
                value={email}
                placeholder="Enter email"
                onChange={(event) => setEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onLogin();
                }}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                placeholder="Enter password"
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onLogin();
                }}
              />
            </label>
            <button type="button" onClick={onLogin}>
              Continue
            </button>
            {authError && <div className="fd-error">{authError}</div>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="fd-root">
      <header className="fd-topbar">
        <div className="fd-top-left">
          <div className="fd-logo-mark sm">C</div>
          <strong>Call A Van</strong>
          <span className="fd-muted">Admin Dashboard</span>
        </div>
        <div className="fd-top-right">
          <span>
            <b>{onlineCount}</b> / {(payload?.drivers ?? []).length} online
          </span>
          <button
            type="button"
            className={tab === "drivers" ? "active" : ""}
            onClick={() => setTab("drivers")}
          >
            Drivers
          </button>
          <button
            type="button"
            className={tab === "insights" ? "active" : ""}
            onClick={() => setTab("insights")}
          >
            Insights
          </button>
          <button
            type="button"
            onClick={() => {
              setLoggedIn(false);
              setEmail("");
              setPassword("");
              setSelectedIds(new Set());
              setTab("drivers");
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      {loading ? (
        <section className="fd-loading">Loading fleet data...</section>
      ) : error ? (
        <section className="fd-loading">
          <div>{error}</div>
          <button type="button" onClick={loadData}>
            Retry
          </button>
        </section>
      ) : tab === "insights" ? (
        <InsightsView
          drivers={payload?.drivers ?? []}
          locations={payload?.locations ?? []}
          statusMap={statusMap}
          servicesMap={servicesMap}
        />
      ) : (
        <section className="fd-content">
          <aside className="fd-sidebar">
            <div className="fd-side-top">
              <input
                placeholder="Search drivers..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="fd-bulk-row">
              <input
                type="checkbox"
                checked={
                  filteredDrivers.length > 0 &&
                  filteredDrivers.every((driver) => selectedIds.has(driver.id))
                }
                onChange={(event) => {
                  if (event.currentTarget.checked) {
                    setSelectedIds(new Set(filteredDrivers.map((driver) => driver.id)));
                  } else {
                    setSelectedIds(new Set());
                  }
                }}
              />
              <span>
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select drivers"}
              </span>
              <button type="button" onClick={() => bulkSetOnline(true)}>
                Set Online
              </button>
              <button type="button" onClick={() => bulkSetOnline(false)}>
                Set Offline
              </button>
            </div>
            <div className="fd-driver-list">
              {filteredDrivers.map((driver) => {
                const name = asString(driver.fieldData.name) || "Unnamed driver";
                const live = asBool(locationMap[driver.id]?.fieldData["is-live"]);
                const active = driver.id === selectedDriver?.id;
                return (
                  <div
                    key={driver.id}
                    className={`fd-driver-row ${active ? "active" : ""}`}
                    onClick={() => setSelectedDriverId(driver.id)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(driver.id)}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() =>
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(driver.id)) next.delete(driver.id);
                          else next.add(driver.id);
                          return next;
                        })
                      }
                    />
                    <DriverAvatar name={name} src={asString(driver.fieldData["profile-picture"])} />
                    <div className="fd-driver-meta">
                      <strong>{name}</strong>
                      <small>{asString(driver.fieldData["vehicle-type-2"]) || "No vehicle type"}</small>
                    </div>
                    <label className="fd-toggle" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={live}
                        disabled={updatingIds.has(driver.id)}
                        onChange={() => toggleOne(driver.id, !live)}
                      />
                      <span />
                    </label>
                  </div>
                );
              })}
            </div>
          </aside>

          <section className="fd-profile">
            {!selectedDriver ? (
              <div className="fd-empty">Select a driver to view profile.</div>
            ) : (
              <ProfileView
                driver={selectedDriver}
                location={locationMap[selectedDriver.id]}
                statusMap={statusMap}
                servicesMap={servicesMap}
              />
            )}
          </section>
        </section>
      )}
    </main>
  );
}

function ProfileView({
  driver,
  location,
  statusMap,
  servicesMap,
}: {
  driver: Driver;
  location?: Location;
  statusMap: Record<string, string>;
  servicesMap: Record<string, string>;
}) {
  const fd = driver.fieldData;
  const statusName = statusMap[asString(fd["status-4"])] || "Unknown";
  const offered = Array.isArray(fd.services)
    ? fd.services.map((id) => servicesMap[asString(id)]).filter(Boolean)
    : [];

  return (
    <div className="fd-profile-wrap">
      <div className="fd-profile-head">
        <DriverAvatar
          name={asString(fd.name) || "Unnamed driver"}
          src={asString(fd["profile-picture"])}
          large
        />
        <div>
          <h3>{asString(fd.name) || "Unnamed driver"}</h3>
          <p>{asString(fd["company-name-2"]) || "No company"}</p>
          <span className={`fd-status ${classForStatus(statusName)}`}>{statusName}</span>
        </div>
      </div>
      <div className="fd-grid">
        <InfoCard title="Contact" rows={[["Email", asString(fd.email)], ["Phone", asString(fd.phone)]]} />
        <InfoCard
          title="Vehicle"
          rows={[
            ["Type", asString(fd["vehicle-type-2"])],
            ["Base", asString(fd["base-area-2"])],
          ]}
        />
        <InfoCard
          title="Insurance"
          rows={[
            ["Confirmed", asBool(fd["insurance-confirmed-2"]) ? "Yes" : "No"],
            ["Expiry", asString(fd["insurance-date"]) || "-"],
          ]}
        />
        <InfoCard
          title="Live location"
          rows={[
            ["Latitude", asString(location?.fieldData.latitude) || "-"],
            ["Longitude", asString(location?.fieldData.longitude) || "-"],
          ]}
        />
      </div>
      <div className="fd-service-box">
        <h4>Services</h4>
        <div className="fd-chip-row">
          {offered.length > 0 ? (
            offered.map((service) => <span key={service}>{service}</span>)
          ) : (
            <small>No services listed</small>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoCard({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <article className="fd-info-card">
      <h4>{title}</h4>
      {rows.map(([left, right]) => (
        <div key={left} className="fd-info-row">
          <span>{left}</span>
          <b>{right || "-"}</b>
        </div>
      ))}
    </article>
  );
}

function InsightsView({
  drivers,
  locations,
  statusMap,
  servicesMap,
}: {
  drivers: Driver[];
  locations: Location[];
  statusMap: Record<string, string>;
  servicesMap: Record<string, string>;
}) {
  const totals = useMemo(() => {
    const locByDriver: Record<string, Location> = {};
    locations.forEach((loc) => {
      const driverId = asString(loc.fieldData.driver);
      if (driverId) locByDriver[driverId] = loc;
    });

    const byStatus: Record<string, number> = {};
    const byService: Record<string, number> = {};
    let live = 0;
    drivers.forEach((driver) => {
      const status = statusMap[asString(driver.fieldData["status-4"])] || "Unknown";
      byStatus[status] = (byStatus[status] ?? 0) + 1;

      if (asBool(locByDriver[driver.id]?.fieldData["is-live"])) live += 1;

      if (Array.isArray(driver.fieldData.services)) {
        driver.fieldData.services.forEach((id) => {
          const serviceName = servicesMap[asString(id)] || "Unknown service";
          byService[serviceName] = (byService[serviceName] ?? 0) + 1;
        });
      }
    });

    return {
      live,
      offline: drivers.length - live,
      byStatus,
      topServices: Object.entries(byService)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
    };
  }, [drivers, locations, statusMap, servicesMap]);

  const onlinePercent = drivers.length > 0 ? Math.round((totals.live / drivers.length) * 100) : 0;
  const statusEntries = Object.entries(totals.byStatus).sort((a, b) => b[1] - a[1]);
  const statusTotal = statusEntries.reduce((sum, [, count]) => sum + count, 0);
  const statusGradient = useMemo(() => {
    if (statusEntries.length === 0 || statusTotal === 0) {
      return "#2d333b 0 100%";
    }

    let offset = 0;
    return statusEntries
      .map(([status, count]) => {
        const key = status.toLowerCase();
        const color = STATUS_COLORS[key] ?? "#388bfd";
        const slice = (count / statusTotal) * 100;
        const from = offset;
        offset += slice;
        return `${color} ${from}% ${offset}%`;
      })
      .join(", ");
  }, [statusEntries, statusTotal]);

  return (
    <section className="fd-insights">
      <div className="fd-stats-row">
        <article className="fd-stat-card">
          <div className="fd-stat-head">
            <InsightIcon tone="blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.9" />
                <path d="M16 3.1a4 4 0 0 1 0 7.8" />
              </svg>
            </InsightIcon>
            <small>Total drivers</small>
          </div>
          <strong>{drivers.length}</strong>
          <p>All active and inactive profiles</p>
        </article>
        <article className="fd-stat-card">
          <div className="fd-stat-head">
            <InsightIcon tone="green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="9" />
                <path d="m8.5 12.3 2.3 2.3 4.8-4.8" />
              </svg>
            </InsightIcon>
            <small>Online now</small>
          </div>
          <strong>{totals.live}</strong>
          <p>Currently broadcasting live location</p>
        </article>
        <article className="fd-stat-card">
          <div className="fd-stat-head">
            <InsightIcon tone="amber">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5" />
                <circle cx="12" cy="16.5" r="0.6" fill="currentColor" />
              </svg>
            </InsightIcon>
            <small>Offline now</small>
          </div>
          <strong>{totals.offline}</strong>
          <p>Not sharing live location</p>
        </article>
        <article className="fd-stat-card">
          <div className="fd-stat-head">
            <InsightIcon tone="purple">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 16 9 11l3 3 8-8" />
                <path d="M14 6h6v6" />
              </svg>
            </InsightIcon>
            <small>Online ratio</small>
          </div>
          <strong>{onlinePercent}%</strong>
          <p>Operational readiness score</p>
        </article>
      </div>

      <div className="fd-charts-grid">
        <article className="fd-chart-card fd-ring-card">
          <h3>
            <InsightIcon tone="green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 3v18" />
                <path d="M3 12h18" />
                <circle cx="12" cy="12" r="9" />
              </svg>
            </InsightIcon>
            Live availability
          </h3>
          <div className="fd-ring-wrap">
            <div
              className="fd-ring"
              style={
                {
                  "--ring-value": `${onlinePercent}%`,
                } as React.CSSProperties
              }
            >
              <div>
                <strong>{onlinePercent}%</strong>
                <small>Online</small>
              </div>
            </div>
            <div className="fd-ring-legend">
              <p>
                <span className="dot online" />
                Online drivers <b>{totals.live}</b>
              </p>
              <p>
                <span className="dot offline" />
                Offline drivers <b>{totals.offline}</b>
              </p>
            </div>
          </div>
        </article>

        <article className="fd-chart-card">
          <h3>
            <InsightIcon tone="blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 20v-8" />
                <path d="M10 20V8" />
                <path d="M16 20V4" />
                <path d="M22 20v-6" />
              </svg>
            </InsightIcon>
            Status distribution
          </h3>
          <div className="fd-ring-wrap">
            <div
              className="fd-ring fd-ring-status"
              style={
                {
                  "--ring-status-gradient": statusGradient,
                } as React.CSSProperties
              }
            >
              <div>
                <strong>{statusEntries.length}</strong>
                <small>Status types</small>
              </div>
            </div>
            <div className="fd-ring-legend">
              {statusEntries.map(([status, count]) => {
                const pct = statusTotal > 0 ? Math.round((count / statusTotal) * 100) : 0;
                return (
                  <p key={status}>
                    <span className={`dot status-${status.toLowerCase()}`} />
                    {status} <b>{count} ({pct}%)</b>
                  </p>
                );
              })}
            </div>
          </div>
        </article>

        <article className="fd-chart-card">
          <h3>
            <InsightIcon tone="amber">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="m6 7 6-3 6 3-6 3-6-3Z" />
                <path d="m6 12 6 3 6-3" />
                <path d="m6 17 6 3 6-3" />
              </svg>
            </InsightIcon>
            Top services
          </h3>
          <div className="fd-vbars">
            {totals.topServices.map(([service, count]) => {
              const pct = drivers.length > 0 ? Math.round((count / drivers.length) * 100) : 0;
              return (
                <div key={service} className="fd-vbar-item">
                  <div className="fd-vbar-wrap">
                    <div className="fd-vbar-track">
                      <div style={{ height: `${Math.max(pct, 10)}%` }} />
                    </div>
                  </div>
                  <div className="fd-vbar-meta">
                    <b>{count}</b>
                    <span>{service}</span>
                  </div>
                </div>
              );
            })}
            {totals.topServices.length === 0 && <small className="fd-empty-note">No service data available</small>}
          </div>
        </article>
      </div>
    </section>
  );
}
