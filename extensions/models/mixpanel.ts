import { z } from "npm:zod@4";

const GlobalArgsSchema = z.object({
  serviceAccountUsername: z.string().describe(
    "Mixpanel service account username",
  ),
  serviceAccountSecret: z.string().describe("Mixpanel service account secret"),
  projectId: z.string().describe("Mixpanel project ID"),
  region: z.enum(["us", "eu"]).default("us").describe(
    "Mixpanel data residency region",
  ),
});

async function mixpanelFetch(context, path, params = {}) {
  const { serviceAccountUsername, serviceAccountSecret, projectId, region } =
    context.globalArgs;

  const baseUrl = region === "eu"
    ? "https://eu.mixpanel.com/api/2.0"
    : "https://mixpanel.com/api/2.0";

  const credentials = btoa(serviceAccountUsername + ":" + serviceAccountSecret);

  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set("project_id", projectId);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  context.logger.info("Fetching {url}", { url: url.toString() });

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${credentials}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Mixpanel API error ${response.status}: ${response.statusText}\n${body}`,
    );
  }

  return await response.json();
}

export const model = {
  type: "@keeb/mixpanel",
  version: "2026.03.01.2",
  globalArguments: GlobalArgsSchema,
  inputsSchema: z.object({
    fromDate: z.string().describe("Start date (YYYY-MM-DD)"),
    toDate: z.string().describe("End date (YYYY-MM-DD)"),
  }),
  resources: {
    "segmentation": {
      description: "Segmentation query results",
      schema: z.object({}).passthrough(),
      lifetime: "infinite",
      garbageCollection: 10,
    },
    "insights": {
      description: "Insights report results",
      schema: z.object({}).passthrough(),
      lifetime: "infinite",
      garbageCollection: 10,
    },
    "funnels": {
      description: "Funnel analysis results",
      schema: z.object({}).passthrough(),
      lifetime: "infinite",
      garbageCollection: 10,
    },
    "retention": {
      description: "Retention analysis results",
      schema: z.object({}).passthrough(),
      lifetime: "infinite",
      garbageCollection: 10,
    },
    "funnelsList": {
      description: "List of available funnels",
      schema: z.object({}).passthrough(),
      lifetime: "infinite",
      garbageCollection: 10,
    },
    "board": {
      description: "Dashboard/board data",
      schema: z.object({}).passthrough(),
      lifetime: "infinite",
      garbageCollection: 10,
    },
  },
  methods: {
    segmentation: {
      description: "Query event segmentation data",
      arguments: z.object({
        event: z.string().describe("Event name to segment"),
        fromDate: z.string().describe("Start date (YYYY-MM-DD)"),
        toDate: z.string().describe("End date (YYYY-MM-DD)"),
        type: z.enum(["general", "unique", "average"]).default("general"),
        unit: z.enum(["minute", "hour", "day", "week", "month"]).default("day"),
        on: z.string().optional().describe("Property to break down by"),
        where: z.string().optional().describe("Filter expression"),
      }),
      execute: async (args, context) => {
        const params = {
          event: args.event,
          from_date: args.fromDate,
          to_date: args.toDate,
          type: args.type,
          unit: args.unit,
        };
        if (args.on) {
          // Support both "prop" and pre-formatted 'properties["prop"]' syntax
          if (args.on.startsWith("properties[")) {
            params.on = args.on;
          } else {
            params.on = `properties["${args.on}"]`;
          }
        }
        if (args.where) params.where = args.where;

        const data = await mixpanelFetch(context, "/segmentation", params);

        const handle = await context.writeResource(
          "segmentation",
          "segmentation",
          data,
        );
        return { dataHandles: [handle] };
      },
    },
    query_insights: {
      description: "Query a saved Insights report by bookmark ID",
      arguments: z.object({
        bookmarkId: z.string().describe("Insights bookmark ID"),
      }),
      execute: async (args, context) => {
        const data = await mixpanelFetch(context, "/insights", {
          bookmark_id: args.bookmarkId,
        });

        const handle = await context.writeResource(
          "insights",
          "insights",
          data,
        );
        return { dataHandles: [handle] };
      },
    },
    query_funnels: {
      description: "Query funnel conversion data",
      arguments: z.object({
        funnelId: z.string().describe("Funnel ID from Mixpanel"),
        fromDate: z.string().describe("Start date (YYYY-MM-DD)"),
        toDate: z.string().describe("End date (YYYY-MM-DD)"),
        unit: z.enum(["day", "week", "month"]).optional(),
      }),
      execute: async (args, context) => {
        const params = {
          funnel_id: args.funnelId,
          from_date: args.fromDate,
          to_date: args.toDate,
        };
        if (args.unit) params.unit = args.unit;

        const data = await mixpanelFetch(context, "/funnels", params);

        const handle = await context.writeResource(
          "funnels",
          "funnels",
          data,
        );
        return { dataHandles: [handle] };
      },
    },
    query_retention: {
      description: "Query user retention data",
      arguments: z.object({
        fromDate: z.string().describe("Start date (YYYY-MM-DD)"),
        toDate: z.string().describe("End date (YYYY-MM-DD)"),
        bornEvent: z.string().describe("Event that defines the cohort birth"),
        event: z.string().describe("Event that defines return activity"),
        unit: z.enum(["day", "week", "month"]).optional(),
      }),
      execute: async (args, context) => {
        const params = {
          from_date: args.fromDate,
          to_date: args.toDate,
          born_event: args.bornEvent,
          event: args.event,
        };
        if (args.unit) params.unit = args.unit;

        const data = await mixpanelFetch(context, "/retention", params);

        const handle = await context.writeResource(
          "retention",
          "retention",
          data,
        );
        return { dataHandles: [handle] };
      },
    },
    list_funnels: {
      description: "List all available funnels in the project",
      arguments: z.object({}),
      execute: async (_args, context) => {
        const data = await mixpanelFetch(context, "/funnels/list");

        const handle = await context.writeResource(
          "funnelsList",
          "funnelsList",
          data,
        );
        return { dataHandles: [handle] };
      },
    },
    get_board: {
      description: "Get a dashboard/board by ID",
      arguments: z.object({
        boardId: z.string().describe("Board ID from Mixpanel URL"),
      }),
      execute: async (args, context) => {
        const {
          serviceAccountUsername,
          serviceAccountSecret,
          projectId,
          region,
        } = context.globalArgs;

        const baseHost = region === "eu" ? "eu.mixpanel.com" : "mixpanel.com";
        const credentials = btoa(
          serviceAccountUsername + ":" + serviceAccountSecret,
        );

        // Try the app/boards endpoint
        const url =
          `https://${baseHost}/api/app/boards/${args.boardId}?project_id=${projectId}`;
        context.logger.info("Fetching board {url}", { url });

        const response = await fetch(url, {
          headers: {
            Accept: "application/json",
            Authorization: `Basic ${credentials}`,
          },
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(
            `Mixpanel API error ${response.status}: ${response.statusText}\n${body}`,
          );
        }

        const data = await response.json();

        const handle = await context.writeResource(
          "board",
          "board",
          data,
        );
        return { dataHandles: [handle] };
      },
    },
  },
};
