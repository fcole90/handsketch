/**
 * Drawing tools.
 *
 * @date 2016-01-17
 */

"use strict";

const drawing = function ($) {

    // public interface
    const d = {};

    // private and dynamically callable interface
    const pvt = {};

    // shorter alias for the color picker widget
    const cpw = colorPickerWidget;

    // canvas, context, image data, data array
    var canvas = null;
    var ctx = null;
    var imageData = null;
    var data = null;

    // ensure the pixels are not processed twice in the same stroke
    var done = null;

    // maximum possible squared distance between RGBA colors
    const MAX_DISTANCE = 4 * 255 * 255;

    // maximum possible values
    const OPACITY_MAX = 100;
    const THRESH_MAX = 100;
    const DENSITY_MAX = 100;

    // current tool and its properties
    var mTool = null;
    var mThickness = null;
    var mDensity = null;
    var mShape = null;
    var mOpacity = null;
    var mThreshold = null;

    // undo and redo stacks
    // the whole image data is saved for each entry: quite expensive but easy
    // enough for this application prototype
    const UNDO_STACK = [];
    const REDO_STACK = [];

    /**
     * Get or set the active drawing tool.
     * @param  {string} t Tool name.
     * @return {string}   Tool name.
     */
    d.tool = function (t) {
        if (t !== undefined) {
            try {
                if ($.type(pvt[t]) !== 'function' && $.type(d[t]) !== 'function')
                    throw new Error('The selected object is not a function');
                mTool = t;
            }
            catch (e) {
                console.log('Error: invalid tool ' + t + '\n' + e);
            }
        }

        return mTool;
    };

    /**
     * Get or set the active drawing tool's shape.
     * @param  {string} s Shape name.
     * @return {string}   Shape name.
     */
    d.shape = function (s) {
        if (s !== undefined) {
            try {
                // set shape
                if ($.type(pvt[s]) !== 'function')
                    throw new Error('The selected object is not a function');
                mShape = s;
            }
            catch (e) {
                console.log('Error: invalid shape ' + s + '\n' + e);
            }
        }

        return mShape;
    };

    /**
     * Get or set the opacity value.
     * @param  {number} o Opacity value in the `0..OPACITY_MAX` range.
     * @return {number}   Opacity value in the [0,1] range.
     */
    d.opacity = function (o) {
        if (o !== undefined) {
            mOpacity = o / OPACITY_MAX;
        }
        return mOpacity;
    };

    /**
     * Get or set the density value.
     * @param  {number} d Density value in the `0..DENSITY_MAX` range.
     * @return {number}   Density value in the [0,1] range.
     */
    d.density = function (d) {
        if (d !== undefined) {
            mDensity = d / DENSITY_MAX;
        }
        return mDensity;
    };

    /**
     * Get or set the threshold value.
     * @param  {number} t Threshold value in the `0..THRESH_MAX` range.
     * @return {number}   Threshold value in the [0,1] range.
     */
    d.threshold = function (t) {
        if (t !== undefined) {
            mThreshold = t / THRESH_MAX;
        }
        return mThreshold;
    };

    /**
     * Get or set the thickness value.
     * @param  {number} t Thickness value.
     * @return {number}   Thickness value.
     */
    d.thickness = function (t) {
        if (t !== undefined) {
            mThickness = t;
        }
        return mThickness;
    };

    /**
     * Get or set the canvas object in use.
     * @param  {Canvas} c Canvas object to use.
     * @return {Canvas}   Canvas object in use.
     */
    d.canvas = function (c) {
        if (c !== undefined) {
            canvas = c;
            ctx = canvas.getContext('2d');
        }
        return canvas;
    };

    /**
     * Clear the canvas, resize it to the input size and optionally draw an
     * image inside it.
     * @param  {number} width  Width for the canvas.
     * @param  {number} height Height for the canvas.
     * @param  {Image}  img    Optional image to be drawn inside the canvas.
     */
    d.canvasResize = function (width, height, img) {
        // clear and resize
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = width;
        canvas.height = height;

        // draw image from file or fill with white pixels
        if (img !== undefined && img !== null) {
            ctx.drawImage(img, 0, 0);
            imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            data = imageData.data;
        }
        else {
            imageData = ctx.createImageData(canvas.width, canvas.height);
            data = imageData.data;
            for (var i = 0; i < data.length; i++)
                data[i] = 255;
            ctx.putImageData(imageData, 0, 0);
        }

        // update done array
        done = new Array((data.length / 4) | 0);

        // ask to fit canvas layout
        var e = new Event('canvasUpdate');
        document.dispatchEvent(e);
    };

    /**
     * Check if a pixel is inside a circle.
     * @param  {number} x  X coordinate of the pixel in the canvas.
     * @param  {number} y  Y coordinate of the pixel in the canvas.
     * @param  {number} x0 X coordinate of the circle's centre.
     * @param  {number} y0 Y coordinate of the circle's centre.
     * @return {bool}      True if the pixel is inside the circle.
     */
    pvt.circle = function (x, y, x0, y0) {
        var dx = x - x0;
        var dy = y - y0;
        return dx * dx + dy * dy <= mThickness * mThickness;
    };

    /**
     * Check if a pixel is inside a square.
     * @param  {number} x  X coordinate of the pixel in the canvas.
     * @param  {number} y  Y coordinate of the pixel in the canvas.
     * @param  {number} x0 X coordinate of the square's centre.
     * @param  {number} y0 Y coordinate of the square's centre.
     * @return {bool}      True if the pixel is inside the square.
     */
    pvt.square = function (x, y, x0, y0) {
        return true;
    };

    /**
     * Check if a pixel is inside a diamond.
     * @param  {number} x  X coordinate of the pixel in the canvas.
     * @param  {number} y  Y coordinate of the pixel in the canvas.
     * @param  {number} x0 X coordinate of the diamond's centre.
     * @param  {number} y0 Y coordinate of the diamond's centre.
     * @return {bool}      True if the pixel is inside the diamond.
     */
    pvt.diamond = function (x, y, x0, y0) {
        return Math.abs(x - x0) + Math.abs(y - y0) < mThickness;
    };

    /**
     * Distance from the centre of the tool, using a different metric according
     * to the tool's shape.
     * @param  {number} x  X coordinate of the pixel in the canvas.
     * @param  {number} y  Y coordinate of the pixel in the canvas.
     * @param  {number} x0 X coordinate of the tool's centre.
     * @param  {number} y0 Y coordinate of the tool's centre.
     * @return {number}    Distance between the pixel and the tool's centre.
     */
    function distance(x, y, x0, y0) {
        switch (mShape) {
            case circle:
                return Math.hypot(x - x0, y - y0);
            case square:
                return Math.max(x - x0, y - y0);
            case diamond:
                return Math.abs(x - x0, y - y0);
            default:
                throw "Invalid shape";
        }
    }

    /**
     * Perform alpha blending on the selected pixel.
     * @param  {number} k Index of the pixel in the data array.
     */
    function alphaBlend(k) {
        // alpha blending
        var m = k * 4;
        var a = cpw.alpha() / 255 * mOpacity;
        var na = (1 - a) * data[m + 3] / 255;
        var da = a + na; // computed alpha
        data[m + 3] = 255 * da | 0;
        if (da) {
            data[m + 0] = (data[m + 0] * na + cpw.red() * a) | 0;
            data[m + 1] = (data[m + 1] * na + cpw.green() * a) | 0;
            data[m + 2] = (data[m + 2] * na + cpw.blue() * a) | 0;
        }
        else {
            data[m] = data[m + 1] = data[m + 2] = 0;
        }
    }

    /**
     * Pixel action for the brush tool.
     * @param  {number} i X coordinate of the pixel.
     * @param  {number} j Y coordinate of the pixel
     * @param  {number} x X coordinate for the centre of the tool.
     * @param  {number} y Y coordinate for the centre of the tool.
     */
    pvt.brush = function (i, j, x, y) {
        var k = canvas.width * i + j;
        if (pvt[mShape](j, i, x, y) && !done[k]) {
            alphaBlend(k);
            done[k] = true;
        }
    };

    /**
     * Pixel action for the airbrush tool.
     * @param  {number} i X coordinate of the pixel.
     * @param  {number} j Y coordinate of the pixel
     * @param  {number} x X coordinate for the centre of the tool.
     * @param  {number} y Y coordinate for the centre of the tool.
     */
    pvt.airbrush = function (i, j, x, y) {
        var k = canvas.width * i + j;
        if (pvt[mShape](j, i, x, y) && !done[k]) {
            if (Math.random() < mDensity) {
                alphaBlend(k);
            }
            done[k] = true;
        }
    };

    /**
     * Pixel action for the eraser tool.
     * @param  {number} i X coordinate of the pixel.
     * @param  {number} j Y coordinate of the pixel
     * @param  {number} x X coordinate for the centre of the tool.
     * @param  {number} y Y coordinate for the centre of the tool.
     */
    pvt.eraser = function (i, j, x, y) {
        var k = canvas.width * i + j;
        if (pvt[mShape](j, i, x, y) && !done[k]) {
            var m = k * 4;
            data[m + 3] = (data[m + 3] * (1 - mOpacity)) | 0;
            done[k] = true;
        }
    };

    /**
     * Check wether a point has still to be processed by the bucket filler.
     * @param  {Object} p Point
     * @return {bool}     True if the point must be processed, false if it has
     *                    already been processed or if it is outside of the
     *                    canvas.
     */
    function filled(p) {
        return done[canvas.width * p.y + p.x]
            || p.x < 0
            || p.x > canvas.width
            || p.y < 0
            || p.y > canvas.height;
    }

    /**
     * Filler bucket tool.
     * @param  {number} x X coordinate.
     * @param  {number} y Y coordinate.
     */
    d.filler = function (x, y) {
        // canvas size
        const WW = canvas.width;
        const HH = canvas.height;

        // pixel indexes
        var k = WW * y + x;
        var m = k * 4;

        // color of the start pixel
        const R0 = data[m + 0];
        const G0 = data[m + 1];
        const B0 = data[m + 2];
        const A0 = data[m + 3];

        // fill color
        const RR = cpw.red();
        const GG = cpw.green();
        const BB = cpw.blue();
        const AA = cpw.alpha() * mOpacity;

        // squared threshold for the color distance
        const THRESHOLD = mThreshold * mThreshold * MAX_DISTANCE;

        // variable for the pixel
        var p = {'x': x, 'y': y};
        var q = null;

        // FIFO for the pixels to be processed
        const fifo = [p];

        // variables for color difference components
        var da, db, dc;

        while (fifo.length) {
            p = fifo.pop();

            k = (WW * p.y + p.x);
            m = 4 * k;
            done[k] = true;

            // check color distance respect to the start pixel
            da = (data[m + 0] - R0);
            db = (data[m + 1] - G0);
            dc = (data[m + 2] - B0);
            da = (data[m + 3] - A0);

            if (da * da + db * db + dc * dc + da * da < THRESHOLD) {
                // color the point
                data[m + 0] = RR;
                data[m + 1] = GG;
                data[m + 2] = BB;
                data[m + 3] = AA;

                // add its neighbours to the fifo if needed
                // the code inlining here actually provides a performance gain

                // leftward pixel
                if (!(done[WW * p.y + (p.x - 1)] ||
                        p.x - 1 < 0 || p.x - 1 >= WW || p.y < 0 || p.y >= HH)) {
                    fifo.push({'x' : p.x - 1, 'y': p.y});
                }

                // rightward pixel
                if (!(done[WW * p.y + (p.x + 1)] ||
                        p.x + 1 < 0 || p.x + 1 >= WW || p.y < 0 || p.y >= HH)) {
                    fifo.push({'x' : p.x + 1, 'y': p.y});
                }

                // downward pixel
                if (!(done[WW * (p.y - 1) + p.x] ||
                        p.x < 0 || p.x >= WW || p.y - 1 < 0 || p.y - 1 >= HH)) {
                    fifo.push({'x' : p.x, 'y': p.y - 1});
                }

                // upward pixel
                if (!(done[WW * (p.y + 1) + p.x] ||
                        p.x < 0 || p.x >= WW || p.y + 1 < 0 || p.y + 1 >= HH)) {
                    fifo.push({'x' : p.x, 'y': p.y + 1});
                }
            }
        }
        ctx.putImageData(imageData, 0, 0);
    };

    /**
     * Color picker tool.
     * @param  {number} x X coordinate.
     * @param  {number} y Y coordinate.
     */
    d.picker = function (x, y) {
        var k = canvas.width * y + x;
        var m = k * 4;

        if (mThickness > 1) {
            // pick the average color from an area
            var n = 0;
            var r = 0;
            var g = 0;
            var b = 0;
            var a = 0;

            var y0 = Math.max(0, y - mThickness);
            var y1 = Math.min(canvas.height, y + mThickness);
            var x0 = Math.max(0, x - mThickness);
            var x1 = Math.min(canvas.width, x + mThickness);

            for (var i = y0; i <= y1; i++) {
                for (var j = x0; j <= x1; j++) {
                    if (pvt[mShape](j, i, x, y)) {
                        var m = 4 * (canvas.width * i + j);
                        r += data[m + 0];
                        g += data[m + 1];
                        b += data[m + 2];
                        a += data[m + 3];
                        ++n;
                    }
                }
            }

            cpw.red((r / n) | 0);
            cpw.green((g / n) | 0);
            cpw.blue((b / n) | 0);
            cpw.alpha((a / n) | 0);
        }
        else {
            // pick the exact color from a pixel
            cpw.red(data[m + 0]);
            cpw.green(data[m + 1]);
            cpw.blue(data[m + 2]);
            cpw.alpha(data[m + 3]);
        }

        // trigger event to update the sliders
        $('.color-value').trigger('input');
    };

    /**
     * Apply the action of the currently selected tool, on the canvas
     * coordinates passed as arguments.
     * @param  {number} x X coordinate.
     * @param  {number} y Y coordinate.
     */
    d.toolAction = function (x, y) {
        var y0 = Math.max(0, y - mThickness);
        var y1 = Math.min(canvas.height, y + mThickness);
        var x0 = Math.max(0, x - mThickness);
        var x1 = Math.min(canvas.width, x + mThickness);

        for (var i = y0; i <= y1; i++) {
            for (var j = x0; j <= x1; j++) {
                pvt[mTool](i, j, x, y);
            }
        }
        ctx.putImageData(imageData, 0, 0);
    };

    /**
     * Start a new stroke with a drawing tool.
     */
    d.startStroke = function () {
        done.fill(false);
    }

    /**
     * Return the shape following the input one.
     * @param  {string} s Name of the current shape.
     * @return {string}   Name of the following shape.
     */
    d.nextShape = function (s) {
        switch (s) {
        case 'circle':
            return 'square';
        case 'square':
            return 'diamond';
        case 'diamond':
            return 'circle';
        default:
            throw new Error('nextShape: invalid shape');
        }
    }

    /**
     * Return the shape preceeding the input one.
     * @param  {string} s Name of the current shape.
     * @return {string}   Name of the preceeding shape.
     */
    d.prevShape = function (s) {
        switch (s) {
        case 'circle':
            return 'diamond';
        case 'square':
            return 'circle';
        case 'diamond':
            return 'square';
        default:
            throw new Error('prevShape: invalid shape');
        }
    }

    /**
     * Undo a tool action, restoring the canvas before the action itself.
     * @return {bool}      True if an action was successfully undone, false if
     *                     there was not any undoable action.
     */
    d.undo = function () {
        if (UNDO_STACK.length < 1) {
            return false;
        }

        // keep a copy of undone action for redo
        REDO_STACK.push(new ImageData(data.slice(), canvas.width, canvas.height));

        // restore canvas
        imageData = UNDO_STACK.pop();
        data = imageData.data;
        ctx.putImageData(imageData, 0, 0);

        return true;
    };

    /**
     * Redo an undone action.
     * @return {bool}      True if an action was successfully redone, false if
     *                     there was not any redoable action.
     */
    d.redo = function () {
        if (REDO_STACK.length < 1) {
            return false;
        }

        // keep a copy of redone image for undo
        UNDO_STACK.push(new ImageData(data.slice(), canvas.width, canvas.height));

        // restore canvas
        imageData = REDO_STACK.pop();
        data = imageData.data;
        ctx.putImageData(imageData, 0, 0);

        return true;
    };

    /**
     * Check if there are undoable actions.
     * @return {bool} True if there is at least one undoable action.
     */
    d.undoable = function () {
        return UNDO_STACK.length > 0;
    };

    /**
     * Check if there are redoable actions.
     * @return {bool} True if there is at least one redoable action.
     */
    d.redoable = function () {
        return REDO_STACK.length > 0;
    };

    /**
     * Create a snapshot of the current canvas in the undo stack.
     */
    d.snapshot = function () {
        UNDO_STACK.push(new ImageData(data.slice(), canvas.width, canvas.height));
        REDO_STACK.length = 0;
    };

    return d;

} (jQuery);
