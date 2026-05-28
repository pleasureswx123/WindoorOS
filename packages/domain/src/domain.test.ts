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

  it("applies profile system face widths and deductions to takeoff", () => {
    const drawingModel = createDrawingModel({
      widthMm: 1800,
      heightMm: 1500,
      verticalMullions: 1,
      horizontalMullions: 0,
      openType: "casement",
      dimensionRules: {
        frameFaceWidthMm: 80,
        mullionFaceWidthMm: 90,
        sashFaceWidthMm: 65,
        frameDeductionMm: 20,
        mullionDeductionMm: 100,
        glassDeductionMm: 30,
        glassInstallGapMm: 15,
        sashDeductionMm: 130
      }
    });
    const takeoff = calculateMaterialTakeoff([
      {
        id: "w2",
        orderId: "o1",
        name: "系统窗",
        floor: "一楼",
        position: "前",
        widthMm: 1800,
        heightMm: 1500,
        quantity: 1,
        openType: "casement",
        drawingModel
      }
    ]);

    expect(takeoff.profiles).toContainEqual(expect.objectContaining({ label: "外框横料", lengthMm: 1780, quantity: 2 }));
    expect(takeoff.profiles).toContainEqual(expect.objectContaining({ label: "外框竖料", lengthMm: 1480, quantity: 2 }));
    expect(takeoff.profiles).toContainEqual(expect.objectContaining({ label: "竖中梃", lengthMm: 1400, quantity: 1 }));
    expect(takeoff.profiles).toContainEqual(expect.objectContaining({ label: "扇横料", lengthMm: 775, quantity: 2 }));
    expect(takeoff.profiles).toContainEqual(expect.objectContaining({ label: "扇竖料", lengthMm: 1210, quantity: 2 }));
    expect(takeoff.glass.some((item) => item.widthMm === 615 && item.heightMm === 1180)).toBe(true);
  });
});
