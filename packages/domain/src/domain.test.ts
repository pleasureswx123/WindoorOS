import { describe, expect, it } from "vitest";
import { calculateMaterialTakeoff, createDrawingModel, validateDrawingModel } from "./index";

describe("drawing model", () => {
  it("creates valid parameterized windows", () => {
    const model = createDrawingModel({
      widthMm: 1800,
      heightMm: 1500,
      verticalMullions: 1,
      horizontalMullions: 1,
      openType: "casement"
    });

    expect(validateDrawingModel(model)).toEqual([]);
    expect(model.mullions).toHaveLength(2);
    expect(model.glassPanels).toHaveLength(4);
  });

  it("takes off frame, mullion, sash and glass requirements", () => {
    const drawingModel = createDrawingModel({
      widthMm: 1800,
      heightMm: 1500,
      verticalMullions: 1,
      horizontalMullions: 0,
      openType: "sliding"
    });
    const takeoff = calculateMaterialTakeoff([
      {
        id: "w1",
        orderId: "o1",
        name: "一楼前窗",
        floor: "一楼",
        position: "前",
        widthMm: 1800,
        heightMm: 1500,
        quantity: 2,
        openType: "sliding",
        drawingModel
      }
    ]);

    expect(takeoff.windowCount).toBe(2);
    expect(takeoff.profiles.length).toBeGreaterThan(3);
    expect(takeoff.profiles.some((item) => item.materialCode.endsWith("-SASH"))).toBe(true);
    expect(takeoff.glass.reduce((sum, item) => sum + item.quantity, 0)).toBe(4);
  });
});
