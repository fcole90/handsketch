/**
 * JavaScript code for the circular selector.
 * This script counts the n entries in the selector, draws a circular sector
 * covering 1/n th of the circle and uses it to clip each entry. The entries
 * are then disposed around the circle with proper rotations.
 *
 * @author Martino Pilia <martino.pilia@gmail.com>
 * @date 2015-12-31
 */

"use strict";

/**
 * Apply style to the selected tool entry.
 * @param {string}   name    Name of the selector.
 * @param {number}   i       Index of the selected entry.
 * @param {function} handler Handler for the click events on entries.
 */
function selectEntry(name, i, handler) {
    $("#" + name + "-selector .selected-tool").removeClass("selected-tool");
    var li = $("#" + name + "-selector li:nth-child(" + i + ")");
    li.addClass("selected-tool");
    if (handler)
        handler(li.attr('data-entry'));
}

/**
 * Toggle highlighting of the selector's hint picture.
 * @param {string} name Name of the selector.
 * @param {bool}   val  True to highlight, false to remove highlighting.
 */
function hintHighlight(name, val) {
    if (val)
        $("#" + name + "-selector-hint").addClass("highlighted-selector");
    else
        $("#" + name + "-selector-hint").removeClass("highlighted-selector");
}

/**
 * Dynamical setup of the selector according to its size.
 * @param  {string} name    Name of the selector, the part of its id before
 *                          '-selector' (e.g. 'tool' for the selector whose
 *                          id is 'tool-selector').
 * @param  {function} handler Handler for click events on entries. Must be a
 *                            function accepting as a parameter the data
 *                            associated to the entry ('data-entry' attribute).
 */
function setupSelector(name, handler) {
    // selector entries
    var tools = $("#" + name + "-selector li");

    // number of entries in the selector
    const TOOLS_NO = tools.length;

    if (TOOLS_NO < 1)
        return;

    // angular separation between entries (in degs)
    var sep = 1;

    // angular amplitude of each selector entry
    var angle = 360 / TOOLS_NO - sep;

    // draw the path in the svg to clip the selector entry
    var angleRad = angle * Math.PI / 180;
    var x = 0.5 + 0.5 * Math.cos(angleRad);
    var y = 0.5 - 0.5 * Math.sin(angleRad);
    $("." + name + "-sector").attr(
            "d",
            "M0.5,0.5 l0.5,0 A0.5,0.5 0 0,0 " + x + "," + y + " z");

    // clip-path and rotate each selector entry
    tools.each(function (i) {
        // (angle + sep) * i is occupated by the previous i entries, (sep / 2)
        // is for actual separation from the previous entry
        var rot = (angle + sep) * i + (sep / 2);

        // clip-path the entry
        $(this).css("clip-path", "url(#" + name + "-sector)");
        $(this).css("-webkit-clip-path", "url(#" + name + "-sector)");

        // rotate to its final position
        $(this).css("transform", "rotate(" + rot + "deg)");
        $(this).css("-webkit-transform", "rotate(" + rot + "deg)");

        // counter-rotate the entry's content
        $(this).find(".selector-entry").css(
                "transform",
                "rotate(-" + rot + "deg)");
        $(this).find(".selector-entry").css(
                "-webkit-transform",
                "rotate(-" + rot + "deg)");

        // add event handler on mouse click for the tool selection
        $(this).click(function () {
            selectEntry(name, i + 1, handler);
        });
    });

    // default selection on the first entry
    selectEntry(name, 1, handler);
}