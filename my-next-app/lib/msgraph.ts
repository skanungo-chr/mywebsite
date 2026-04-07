const TENANT_ID = process.env.AZURE_TENANT_ID!;
// Graph API app ("my-next-app") credentials — used for server-side SharePoint access
const CLIENT_ID = process.env.AZURE_GRAPH_CLIENT_ID!;
const CLIENT_SECRET = process.env.AZURE_GRAPH_CLIENT_SECRET!;

// App-only token via client credentials (Graph API app)
export async function getGraphToken(): Promise<string> {
  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get Graph token: ${err}`);
  }

  const data = await res.json();
  return data.access_token;
}

// Graph fetch — uses delegated user token if provided, else falls back to app-only
export async function graphFetch(
  endpoint: string,
  tokenOrNull?: string | null
): Promise<unknown> {
  const token = tokenOrNull ?? (await getGraphToken());

  const res = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph API error: ${err}`);
  }

  return res.json();
}
