import React from "react";
import { isFiniteNumber } from "../utils/isFiniteNumber.js";
import { ConstraintMask, ConstraintValues, DimensionType, valueToDimensionType, } from "./Constraints.js";
function isString(t) {
    return typeof t === "string";
}
// The old constraint system does not allow for strings, so this function checks if the layout props contain string values
// In certain centering cases we can convert the strings to the old constraint system, so that logic is captured here
function containsInvalidStringValues(props) {
    const { left, right, top, bottom, center } = props;
    // We never allow right or bottom to be strings
    if ([right, bottom].some(isString)) {
        return true;
    }
    // Only allow a string for left, if it is part of the centering logic
    if (isString(left) && (!center || center === "y")) {
        // We are not centering or only centering in the opposite direction
        return true;
    }
    // Only allow a string for top, if it is part of the centering logic
    if (isString(top) && (!center || center === "x")) {
        // We are not centering or only centering in the opposite direction
        return true;
    }
    return false;
}
/** @internal */
export function constraintsEnabled(props) {
    const { _constraints } = props;
    if (!_constraints) {
        return false;
    }
    if (containsInvalidStringValues(props)) {
        return false;
    }
    return _constraints.enabled;
}
function sizeFromFiniteNumberProps(props) {
    const { size } = props;
    let { width, height } = props;
    if (isFiniteNumber(size)) {
        if (width === undefined) {
            width = size;
        }
        if (height === undefined) {
            height = size;
        }
    }
    if (isFiniteNumber(width) && isFiniteNumber(height)) {
        return {
            width: width,
            height: height,
        };
    }
    return null;
}
function rectFromFiniteNumberProps(props) {
    const size = sizeFromFiniteNumberProps(props);
    if (size === null) {
        return null;
    }
    const { left, top } = props;
    if (isFiniteNumber(left) && isFiniteNumber(top)) {
        return {
            x: left,
            y: top,
            ...size,
        };
    }
    return null;
}
export function calculateSize(props, parentSize) {
    if (!constraintsEnabled(props) ||
        parentSize === ParentSizeState.Disabled ||
        parentSize === ParentSizeState.DisabledForCurrentLevel) {
        return sizeFromFiniteNumberProps(props);
    }
    const constraintValues = getConstraintValues(props);
    const pixelAlign = true;
    const parentSizeForSizing = deprecatedParentSize(parentSize);
    // When a node is using vw/vh, its size should be calculated with the viewport size, while its position should
    // be calculated with the parent size. But we are interested only in the size here, so we can use the same parent
    // size for both. Even though we pixel-align the width/height based on x/y, the x/y diff between the two parent sizes
    // is the viewport height, which is always an integer, so it shouldn't affect the rounded width/height.
    const parentSizeInfo = parentSizeForSizing
        ? { sizing: parentSizeForSizing, positioning: parentSizeForSizing }
        : null;
    const rect = ConstraintValues.toRect(constraintValues, parentSizeInfo, null, pixelAlign);
    return { width: rect.width, height: rect.height };
}
/** @internal */
export function calculateRect(props, parentSize, pixelAlign = true) {
    if (props.positionFixed || props.positionAbsolute)
        return null;
    const parentSizeDisabled = parentSize === ParentSizeState.Disabled || parentSize === ParentSizeState.DisabledForCurrentLevel;
    if (!constraintsEnabled(props) || parentSizeDisabled) {
        return rectFromFiniteNumberProps(props);
    }
    const constraintValues = getConstraintValues(props);
    const enabledParentSize = deprecatedParentSize(parentSize);
    // We convert viewport sizing to fixed sizing when rendering with library components, so parentSizeForSizing and
    // parentSizeForPositioning are the same.
    const parentSizeInfo = enabledParentSize ? { sizing: enabledParentSize, positioning: enabledParentSize } : null;
    return ConstraintValues.toRect(constraintValues, parentSizeInfo, null, pixelAlign, null);
}
/** @internal */
export function getConstraintValues(props) {
    const { left, right, top, bottom, center, _constraints, size } = props;
    let { width, height } = props;
    if (width === undefined) {
        width = size;
    }
    if (height === undefined) {
        height = size;
    }
    const { aspectRatio, autoSize } = _constraints;
    const constraintMask = ConstraintMask.quickfix({
        left: isFiniteNumber(left),
        right: isFiniteNumber(right),
        top: isFiniteNumber(top),
        bottom: isFiniteNumber(bottom),
        widthType: valueToDimensionType(width),
        heightType: valueToDimensionType(height),
        aspectRatio: aspectRatio || null,
        fixedSize: autoSize === true,
    });
    let widthValue = null;
    let heightValue = null;
    let widthType = DimensionType.FixedNumber;
    let heightType = DimensionType.FixedNumber;
    if (constraintMask.widthType !== DimensionType.FixedNumber && typeof width === "string") {
        const parsedWidth = parseFloat(width);
        if (width.endsWith("fr")) {
            widthType = DimensionType.FractionOfFreeSpace;
            widthValue = parsedWidth;
        }
        else if (width === "auto") {
            widthType = DimensionType.Auto;
        }
        else {
            // Percentage
            widthType = DimensionType.Percentage;
            widthValue = parsedWidth / 100;
        }
    }
    else if (width !== undefined && typeof width !== "string") {
        widthValue = width;
    }
    if (constraintMask.heightType !== DimensionType.FixedNumber && typeof height === "string") {
        const parsedHeight = parseFloat(height);
        if (height.endsWith("fr")) {
            heightType = DimensionType.FractionOfFreeSpace;
            heightValue = parsedHeight;
        }
        else if (height === "auto") {
            heightType = DimensionType.Auto;
        }
        else {
            // Percentage
            heightType = DimensionType.Percentage;
            heightValue = parseFloat(height) / 100;
        }
    }
    else if (height !== undefined && typeof height !== "string") {
        heightValue = height;
    }
    let centerAnchorX = 0.5;
    let centerAnchorY = 0.5;
    // XXX: is this
    if (center === true || center === "x") {
        constraintMask.left = false;
        if (typeof left === "string") {
            centerAnchorX = parseFloat(left) / 100;
        }
    }
    if (center === true || center === "y") {
        constraintMask.top = false;
        if (typeof top === "string") {
            centerAnchorY = parseFloat(top) / 100;
        }
    }
    return {
        // Because we check isFiniteNumber when creating the masks,
        // We know that left, right, top and bottom are numbers if the mask is true for the corresponding value
        // We need to cast this because typescript does not understand that
        left: constraintMask.left ? left : null,
        right: constraintMask.right ? right : null,
        top: constraintMask.top ? top : null,
        bottom: constraintMask.bottom ? bottom : null,
        widthType,
        heightType,
        width: widthValue,
        height: heightValue,
        aspectRatio: constraintMask.aspectRatio || null,
        centerAnchorX: centerAnchorX,
        centerAnchorY: centerAnchorY,
        minHeight: props.minHeight,
        maxHeight: props.maxHeight,
        minWidth: props.minWidth,
        maxWidth: props.maxWidth,
    };
}
/** @internal */
export var ParentSizeState;
(function (ParentSizeState) {
    ParentSizeState[ParentSizeState["Unknown"] = 0] = "Unknown";
    ParentSizeState[ParentSizeState["Disabled"] = 1] = "Disabled";
    ParentSizeState[ParentSizeState["DisabledForCurrentLevel"] = 2] = "DisabledForCurrentLevel";
})(ParentSizeState || (ParentSizeState = {}));
// Only exported for use in class components, otherwise use one of the hooks below
export const ConstraintsContext = React.createContext({
    parentSize: ParentSizeState.Unknown,
});
export function deprecatedParentSize(parentSize) {
    if (parentSize === ParentSizeState.Unknown ||
        parentSize === ParentSizeState.Disabled ||
        parentSize === ParentSizeState.DisabledForCurrentLevel) {
        return null;
    }
    return parentSize;
}
/** @internal */
export function useParentSize() {
    return React.useContext(ConstraintsContext).parentSize;
}
export function isSize(o) {
    return typeof o === "object";
}
/** @internal */
export const ProvideParentSize = props => {
    const currentParentSize = useParentSize();
    const { parentSize, children } = props;
    const value = React.useMemo(() => ({ parentSize }), 
    // We are generating the memoKeys in runtime and react doesn't like it,
    // but it should be safe to ignore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getParentWidth(parentSize), getParentHeight(parentSize)]);
    if (currentParentSize === ParentSizeState.Disabled) {
        return children ? React.createElement(React.Fragment, null, children) : null;
    }
    return React.createElement(ConstraintsContext.Provider, { value: value }, children);
};
function getParentWidth(parentSize) {
    return isSize(parentSize) ? parentSize.width : parentSize;
}
function getParentHeight(parentSize) {
    return isSize(parentSize) ? parentSize.height : parentSize;
}
export const ConsumeParentSize = ConstraintsContext.Consumer;
export function useProvideParentSize(node, parentSize) {
    return React.createElement(ProvideParentSize, { parentSize: parentSize }, node);
}
export function useConstraints(props) {
    const parentSize = useParentSize();
    const calculatedRect = calculateRect(props, parentSize, true);
    return calculatedRect;
}
//# sourceMappingURL=NewConstraints.js.map