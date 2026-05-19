import { describe, expect, it } from "vitest";
import {
  parsedResumeJsonSchema,
  parsedResumeSchema,
  summaryJsonSchema,
} from "@/lib/schemas";

type JsonSchemaNode = {
  type?: string | readonly string[];
  properties?: Record<string, JsonSchemaNode>;
  required?: readonly string[];
  items?: JsonSchemaNode;
  additionalProperties?: boolean;
};

function assertStrictRequiredCoverage(schema: JsonSchemaNode, path: string) {
  if (schema.properties) {
    const propertyKeys = Object.keys(schema.properties).sort();
    const requiredKeys = [...(schema.required ?? [])].sort();
    expect(
      requiredKeys,
      `${path} required must list every property for OpenAI strict mode`,
    ).toEqual(propertyKeys);
    expect(
      schema.additionalProperties,
      `${path} must set additionalProperties: false for OpenAI strict mode`,
    ).toBe(false);
    for (const [name, child] of Object.entries(schema.properties)) {
      assertStrictRequiredCoverage(child, `${path}.${name}`);
    }
  }
  if (schema.items) {
    assertStrictRequiredCoverage(schema.items, `${path}.items`);
  }
}

describe("OpenAI strict json schemas", () => {
  it("parsedResumeJsonSchema declares every property as required", () => {
    assertStrictRequiredCoverage(parsedResumeJsonSchema, "parsedResumeJsonSchema");
  });

  it("summaryJsonSchema declares every property as required", () => {
    assertStrictRequiredCoverage(summaryJsonSchema, "summaryJsonSchema");
  });

  it("parsedResumeSchema tolerates nulls from the model for previously optional fields", () => {
    const parsed = parsedResumeSchema.parse({
      candidateName: null,
      email: null,
      phone: null,
      headline: "Backend engineer",
      skills: ["Node"],
      experience: [
        {
          company: "Acme",
          title: "Engineer",
          startDate: null,
          endDate: null,
          highlights: ["Owned API"],
        },
      ],
      projects: [
        {
          name: "Migration",
          description: "Monolith to services",
          technologies: ["Node"],
          impact: null,
        },
      ],
      education: [],
      highSignalClaims: [],
    });

    expect(parsed.candidateName).toBeUndefined();
    expect(parsed.email).toBeUndefined();
    expect(parsed.phone).toBeUndefined();
    expect(parsed.experience[0]?.startDate).toBeUndefined();
    expect(parsed.experience[0]?.endDate).toBeUndefined();
    expect(parsed.projects[0]?.impact).toBeUndefined();
  });
});
