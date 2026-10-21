import { describe, expect, it } from "vitest";
import { normalizeVisionReport } from "./vision-report";

describe("normalizeVisionReport", () => {
  it("derives the center from a {x,y,width,height} bounding box when none is given", () => {
    const report = normalizeVisionReport({
      elements: [
        {
          name: "OK",
          type: "button",
          boundingBox: { x: 10, y: 10, width: 50, height: 20 },
        },
      ],
    });
    expect(report.elements[0].center).toEqual({ x: 35, y: 20 });
  });

  it("converts a [x1,y1,x2,y2] bbox into a {x,y,width,height} boundingBox", () => {
    const report = normalizeVisionReport({
      elements: [{ name: "OK", type: "button", bbox: [10, 10, 60, 30] }],
    });
    expect(report.elements[0].boundingBox).toEqual({
      x: 10,
      y: 10,
      width: 50,
      height: 20,
    });
  });

  it("drops an element with no box", () => {
    const report = normalizeVisionReport({
      elements: [{ name: "OK", type: "button" }],
    });
    expect(report.elements).toEqual([]);
  });

  it("drops an element whose box has zero size", () => {
    const report = normalizeVisionReport({
      elements: [
        {
          name: "OK",
          type: "button",
          boundingBox: { x: 10, y: 10, width: 0, height: 0 },
        },
      ],
    });
    expect(report.elements).toEqual([]);
  });

  it("maps an unknown type to 'other'", () => {
    const report = normalizeVisionReport({
      elements: [
        {
          name: "OK",
          type: "widget",
          boundingBox: { x: 0, y: 0, width: 10, height: 10 },
        },
      ],
    });
    expect(report.elements[0].type).toBe("other");
  });

  it("uses the label as the name when name is missing", () => {
    const report = normalizeVisionReport({
      elements: [
        {
          label: "Submit",
          type: "button",
          boundingBox: { x: 0, y: 0, width: 10, height: 10 },
        },
      ],
    });
    expect(report.elements[0].name).toBe("Submit");
  });

  it("clamps confidence to the 0..1 range", () => {
    const report = normalizeVisionReport({
      elements: [
        {
          name: "OK",
          type: "button",
          boundingBox: { x: 0, y: 0, width: 10, height: 10 },
          confidence: 5,
        },
      ],
    });
    expect(report.elements[0].confidence).toBe(1);
  });

  it("throws when given null", () => {
    expect(() => normalizeVisionReport(null)).toThrow();
  });

  it("throws when given an array", () => {
    expect(() => normalizeVisionReport([])).toThrow();
  });

  it("throws when given a string", () => {
    expect(() => normalizeVisionReport("nope")).toThrow();
  });

  it("gives an empty elements array when elements is missing", () => {
    const report = normalizeVisionReport({});
    expect(report.elements).toEqual([]);
  });
});
