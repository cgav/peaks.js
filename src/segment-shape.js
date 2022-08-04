/**
 * @file
 *
 * Defines the {@link SegmentShape} class.
 *
 * @module segment-shape
 */

import Konva from 'konva/lib/Core';

import OverlaySegmentMarker from './overlay-segment-marker';
import SegmentMarker from './segment-marker';
import WaveformShape from './waveform-shape';
import { clamp } from './utils';

var defaultFontFamily = 'sans-serif';
var defaultFontSize = 10;
var defaultFontShape = 'normal';

/**
 * Creates a waveform segment shape with optional start and end markers.
 *
 * @class
 * @alias SegmentShape
 *
 * @param {Segment} segment
 * @param {Peaks} peaks
 * @param {SegmentsLayer} layer
 * @param {WaveformOverview|WaveformZoomView} view
 */

function SegmentShape(segment, peaks, layer, view) {
  this._segment       = segment;
  this._peaks         = peaks;
  this._layer         = layer;
  this._view          = view;
  this._label         = null;
  this._startMarker   = null;
  this._endMarker     = null;
  this._color         = segment.color;
  this._draggable     = this._segment.editable && this._view._isSegmentDraggingEnabled();

  var segmentOptions = this._peaks.options.segmentOptions;

  this._overlayOffset = segmentOptions.overlayOffset;

  if (segment.color) {
    this._waveformShape = new WaveformShape({
      color:   segment.color,
      view:    view,
      segment: segment
    });
  }

  this._onMouseEnter  = this._onMouseEnter.bind(this);
  this._onMouseLeave  = this._onMouseLeave.bind(this);
  this._onClick       = this._onClick.bind(this);
  this._onDblClick    = this._onDblClick.bind(this);
  this._onContextMenu = this._onContextMenu.bind(this);

  this._dragBoundFunc      = this._dragBoundFunc.bind(this);
  this._onSegmentDragStart = this._onSegmentDragStart.bind(this);
  this._onSegmentDragMove  = this._onSegmentDragMove.bind(this);

  // Event handlers for markers
  this._onSegmentHandleDragStart   = this._onSegmentHandleDragStart.bind(this);
  this._onSegmentHandleDragMove    = this._onSegmentHandleDragMove.bind(this);
  this._onSegmentHandleDragEnd     = this._onSegmentHandleDragEnd.bind(this);
  this._segmentHandleDragBoundFunc = this._segmentHandleDragBoundFunc.bind(this);

  this._label = this._peaks.options.createSegmentLabel({
    segment:    segment,
    view:       this._view.getName(),
    layer:      this._layer,
    fontFamily: this._peaks.options.fontFamily,
    fontSize:   this._peaks.options.fontSize,
    fontStyle:  this._peaks.options.fontStyle
  });

  if (this._label) {
    this._label.hide();
  }

  // Create with default y and height, the real values are set in fitToView().
  var segmentStartOffset = this._view.timeToPixels(this._segment.startTime);
  var segmentEndOffset   = this._view.timeToPixels(this._segment.endTime);
  var frameStartOffset = this._view.getFrameOffset();
  var startPixel = segmentStartOffset - frameStartOffset;

  var overlayRectHeight = clamp(0, this._view.getHeight() - 2 * this._overlayOffset);

  this._overlay = new Konva.Group({
    x:             startPixel,
    y:             0,
    width:         segmentEndOffset - segmentStartOffset,
    height:        this._view.getHeight(),
    clipX:         0,
    clipY:         this._overlayOffset,
    clipWidth:     segmentEndOffset - segmentStartOffset,
    clipHeight:    overlayRectHeight,
    draggable:     this._draggable,
    dragBoundFunc: this._dragBoundFunc
  });

  var overlayBorderColor, overlayBorderWidth, overlayColor, overlayOpacity, overlayCornerRadius;

  var hasOverlay = segmentOptions.style === 'overlay';

  if (hasOverlay) {
    overlayBorderColor  = segmentOptions.overlayBorderColor;
    overlayBorderWidth  = segmentOptions.overlayBorderWidth;
    overlayColor        = segmentOptions.overlayColor;
    overlayOpacity      = segmentOptions.overlayOpacity;
    overlayCornerRadius = segmentOptions.overlayCornerRadius;
  }

  this._overlayRect = new Konva.Rect({
    x:            0,
    y:            this._overlayOffset,
    width:        segmentEndOffset - segmentStartOffset,
    stroke:       overlayBorderColor,
    strokeWidth:  overlayBorderWidth,
    height:       overlayRectHeight,
    fill:         overlayColor,
    opacity:      overlayOpacity,
    cornerRadius: overlayCornerRadius
  });

  this._overlay.add(this._overlayRect);

  if (hasOverlay) {
    this._overlayText = new Konva.Text({
      x:          segmentOptions.overlayLabelX,
      y:          this._overlayOffset + segmentOptions.overlayLabelY,
      text:       this._segment.labelText,
      fontFamily: segmentOptions.overlayFontFamily,
      fontSize:   segmentOptions.overlayFontSize,
      fontStyle:  segmentOptions.overlayFontStyle,
      fill:       segmentOptions.overlayLabelColor
    });

    this._overlay.add(this._overlayText);

    // Only show the label text if it fits within the overlay segment.
    if (segmentOptions.overlayLabelY + segmentOptions.overlayFontSize > overlayRectHeight) {
      this._overlayText.hide();
    }
  }

  // Set up event handlers to show/hide the segment label text when the user
  // hovers the mouse over the segment.
  this._overlay.on('mouseenter', this._onMouseEnter);
  this._overlay.on('mouseleave', this._onMouseLeave);

  this._overlay.on('click', this._onClick);
  this._overlay.on('dblclick', this._onDblClick);
  this._overlay.on('contextmenu', this._onContextMenu);

  if (this._draggable) {
    this._overlay.on('dragmove', this._onSegmentDragMove);
    this._overlay.on('dragstart', this._onSegmentDragStart);
  }

  this._createMarkers();
}

SegmentShape.prototype._dragBoundFunc = function(pos) {
  // Allow the segment to be moved horizontally but not vertically.
  return {
    x: pos.x,
    y: 0
  };
};

SegmentShape.prototype.updatePosition = function() {
  var segmentStartOffset = this._view.timeToPixels(this._segment.startTime);
  var segmentEndOffset   = this._view.timeToPixels(this._segment.endTime);

  var frameStartOffset = this._view.getFrameOffset();

  var startPixel = segmentStartOffset - frameStartOffset;
  var endPixel   = segmentEndOffset   - frameStartOffset;
  var width      = endPixel - startPixel;

  var marker = this.getStartMarker();

  if (marker) {
    marker.setX(startPixel - marker.getWidth());
  }

  marker = this.getEndMarker();

  if (marker) {
    marker.setX(endPixel);
  }

  if (this._overlay) {
    this._overlay.setAttrs({
      x:         startPixel,
      width:     width,
      clipWidth: width < 1 ? 1 : width
    });

    this._overlayRect.setAttrs({
      x:     0,
      width: width
    });
  }
};

SegmentShape.prototype.getSegment = function() {
  return this._segment;
};

SegmentShape.prototype.getStartMarker = function() {
  return this._startMarker;
};

SegmentShape.prototype.getEndMarker = function() {
  return this._endMarker;
};

SegmentShape.prototype.addToLayer = function(layer) {
  if (this._waveformShape) {
    this._waveformShape.addToLayer(layer);
  }

  if (this._label) {
    layer.add(this._label);
  }

  if (this._startMarker) {
    this._startMarker.addToLayer(layer);
  }

  if (this._endMarker) {
    this._endMarker.addToLayer(layer);
  }

  if (this._overlay) {
    layer.add(this._overlay);
  }
};

function createOverlayMarker(options) {
  return new OverlaySegmentMarker(options);
}

SegmentShape.prototype._createMarkers = function() {
  var editable = this._layer.isEditingEnabled() && this._segment.editable;

  if (!editable) {
    return;
  }

  var createSegmentMarker = this._peaks.options.segmentOptions.style === 'markers' ?
    this._peaks.options.createSegmentMarker :
    createOverlayMarker;

  var startMarker = createSegmentMarker({
    segment:      this._segment,
    draggable:    editable,
    startMarker:  true,
    color:        this._peaks.options.segmentOptions.startMarkerColor,
    fontFamily:   this._peaks.options.fontFamily || defaultFontFamily,
    fontSize:     this._peaks.options.fontSize || defaultFontSize,
    fontStyle:    this._peaks.options.fontStyle || defaultFontShape,
    layer:        this._layer,
    view:         this._view.getName()
  });

  if (startMarker) {
    this._startMarker = new SegmentMarker({
      segment:       this._segment,
      segmentShape:  this,
      draggable:     editable,
      startMarker:   true,
      marker:        startMarker,
      onDragStart:   this._onSegmentHandleDragStart,
      onDragMove:    this._onSegmentHandleDragMove,
      onDragEnd:     this._onSegmentHandleDragEnd,
      dragBoundFunc: this._segmentHandleDragBoundFunc
    });
  }

  var endMarker = createSegmentMarker({
    segment:      this._segment,
    draggable:    editable,
    startMarker:  false,
    color:        this._peaks.options.segmentOptions.endMarkerColor,
    fontFamily:   this._peaks.options.fontFamily || defaultFontFamily,
    fontSize:     this._peaks.options.fontSize || defaultFontSize,
    fontStyle:    this._peaks.options.fontStyle || defaultFontShape,
    layer:        this._layer,
    view:         this._view.getName()
  });

  if (endMarker) {
    this._endMarker = new SegmentMarker({
      segment:       this._segment,
      segmentShape:  this,
      draggable:     editable,
      startMarker:   false,
      marker:        endMarker,
      onDragStart:   this._onSegmentHandleDragStart,
      onDragMove:    this._onSegmentHandleDragMove,
      onDragEnd:     this._onSegmentHandleDragEnd,
      dragBoundFunc: this._segmentHandleDragBoundFunc
    });
  }
};

SegmentShape.prototype._onMouseEnter = function(event) {
  if (this._label) {
    this._label.moveToTop();
    this._label.show();
  }

  this._peaks.emit('segments.mouseenter', {
    segment: this._segment,
    evt: event.evt
  });
};

SegmentShape.prototype._onMouseLeave = function(event) {
  if (this._label) {
    this._label.hide();
  }

  this._peaks.emit('segments.mouseleave', {
    segment: this._segment,
    evt: event.evt
  });
};

SegmentShape.prototype._onClick = function(event) {
  this._peaks.emit('segments.click', {
    segment: this._segment,
    evt: event.evt
  });
};

SegmentShape.prototype._onDblClick = function(event) {
  this._peaks.emit('segments.dblclick', {
    segment: this._segment,
    evt: event.evt
  });
};

SegmentShape.prototype._onContextMenu = function(event) {
  this._peaks.emit('segments.contextmenu', {
    segment: this._segment,
    evt: event.evt
  });
};

SegmentShape.prototype.enableSegmentDragging = function(enable) {
  if (!this._draggable && enable) {
    this._overlay.on('dragstart', this._onSegmentDragStart);
    this._overlay.on('dragmove', this._onSegmentDragMove);
  }
  else if (this._draggable && !enable) {
    this._overlay.off('dragstart', this._onSegmentDragStart);
    this._overlay.off('dragmove', this._onSegmentDragMove);
  }

  this._overlay.draggable(enable);
  this._draggable = enable;
};

SegmentShape.prototype._setPreviousAndNextSegments = function() {
  if (this._view.getSegmentDragMode() !== 'overlap') {
    this._nextSegment = this._peaks.segments.findNextSegment(this._segment);
    this._previousSegment = this._peaks.segments.findPreviousSegment(this._segment);
  }
  else {
    this._nextSegment = null;
    this._previousSegment = null;
  }
};

SegmentShape.prototype._onSegmentDragStart = function() {
  this._setPreviousAndNextSegments();

  this._dragStartX = this._overlay.getX();
  this._dragStartTime = this._segment.startTime;
  this._dragEndTime = this._segment.endTime;
};

SegmentShape.prototype._onSegmentDragMove = function(event) {
  var x = this._overlay.getX();
  var offsetX = x - this._dragStartX;
  var dragMode;
  var minSegmentDuration = 0.25;
  var segmentDuration;

  var timeOffset = this._view.pixelsToTime(offsetX);

  // The WaveformShape for a segment fills the canvas width
  // but only draws a subset of the horizontal range. When dragged
  // we need to keep the shape object in its position but
  // update the segment start and end time so that the right
  // subset is drawn.

  var startTime = this._dragStartTime + timeOffset;
  var endTime = this._dragEndTime + timeOffset;

  if (startTime < 0) {
    startTime = 0;
    endTime = this._segment.endTime - this._segment.startTime;
  }

  if (this._previousSegment && startTime < this._previousSegment.endTime) {
    dragMode = this._view.getSegmentDragMode();

    if (dragMode === 'no-overlap') {
      endTime = this._previousSegment.endTime + (endTime - startTime);
      startTime = this._previousSegment.endTime;
    }
    else if (dragMode === 'compress') {
      segmentDuration = this._previousSegment.endTime - this._previousSegment.startTime;

      if (segmentDuration < minSegmentDuration) {
        minSegmentDuration = segmentDuration;
      }

      if (startTime >= this._previousSegment.startTime + minSegmentDuration) {
        this._previousSegment.update({ endTime: startTime });
      }
      else {
        endTime = this._previousSegment.startTime + minSegmentDuration + (endTime - startTime);
        startTime = this._previousSegment.endTime;
      }
    }
  }

  if (this._nextSegment && endTime > this._nextSegment.startTime) {
    dragMode = this._view.getSegmentDragMode();

    if (dragMode === 'no-overlap') {
      startTime = this._nextSegment.startTime - (endTime - startTime);
      endTime = this._nextSegment.startTime;
    }
    else if (dragMode === 'compress') {
      segmentDuration = this._nextSegment.endTime - this._nextSegment.startTime;

      if (segmentDuration < minSegmentDuration) {
        minSegmentDuration = segmentDuration;
      }

      if (endTime >= this._nextSegment.endTime - minSegmentDuration) {
        startTime = this._nextSegment.endTime - minSegmentDuration - (endTime - startTime);
        endTime = this._nextSegment.startTime;
      }
      else {
        this._nextSegment.update({ startTime: endTime });
      }
    }
  }

  this._segment._setStartTime(startTime);
  this._segment._setEndTime(endTime);
  this._overlay.setX(0);

  this._peaks.emit('segments.dragged', {
    segment: this._segment,
    startMarker: false,
    evt: event.evt
  });
};

/**
 * @param {SegmentMarker} segmentMarker
 */

SegmentShape.prototype._onSegmentHandleDragStart = function(segmentMarker, event) {
  this._setPreviousAndNextSegments();

  this._startMarkerX = this._startMarker.getX();
  this._endMarkerX = this._endMarker.getX();

  this._peaks.emit('segments.dragstart', {
    segment: this._segment,
    startMarker: segmentMarker.isStartMarker(),
    evt: event.evt
  });
};

/**
 * @param {SegmentMarker} segmentMarker
 */

SegmentShape.prototype._onSegmentHandleDragMove = function(segmentMarker, event) {
  var startMarker = segmentMarker.isStartMarker();

  var startMarkerX = this._startMarker.getX();
  var endMarkerX = this._endMarker.getX();
  var segmentWidth = endMarkerX - startMarkerX;

  if (startMarker) {
    var startMarkerOffset = startMarkerX +
                            this._startMarker.getWidth();

    this._overlay.clipWidth(segmentWidth);

    this._segment._setStartTime(this._view.pixelOffsetToTime(startMarkerOffset));

    segmentMarker.timeUpdated(this._segment.startTime);
  }
  else {
    var endMarkerOffset = endMarkerX;

    this._overlay.clipWidth(segmentWidth);

    this._segment._setEndTime(this._view.pixelOffsetToTime(endMarkerOffset));

    segmentMarker.timeUpdated(this._segment.endTime);
  }

  if (startMarkerX !== this._startMarkerX || endMarkerX !== this._endMarkerX) {
    this._startMarkerX = startMarkerX;
    this._endMarkerX = endMarkerX;

    this._peaks.emit('segments.dragged', {
      segment: this._segment,
      startMarker: startMarker,
      evt: event.evt
    });
  }
};

/**
 * @param {SegmentMarker} segmentMarker
 */

SegmentShape.prototype._onSegmentHandleDragEnd = function(segmentMarker, event) {
  this._nextSegment = null;
  this._previousSegment = null;

  var startMarker = segmentMarker.isStartMarker();

  this._peaks.emit('segments.dragend', {
    segment: this._segment,
    startMarker: startMarker,
    evt: event.evt
  });
};

SegmentShape.prototype._segmentHandleDragBoundFunc = function(segmentMarker, pos) {
  var lowerLimit;
  var upperLimit;
  var dragMode;
  var minSegmentDuration = 0.25;
  var segmentDuration;
  var time;

  if (segmentMarker.isStartMarker()) {
    upperLimit = this._endMarker.getX() - this._endMarker.getWidth();

    if (this._previousSegment) {
      dragMode = this._view.getSegmentDragMode();

      if (dragMode === 'no-overlap') {
        lowerLimit = this._view.timeToPixels(this._previousSegment.endTime) -
                     this._view.getFrameOffset();

        if (lowerLimit < 0) {
          lowerLimit = 0;
        }
      }
      else if (dragMode === 'compress') {
        segmentDuration = this._previousSegment.endTime - this._previousSegment.startTime;

        if (segmentDuration < minSegmentDuration) {
          minSegmentDuration = segmentDuration;
        }

        lowerLimit = this._view.timeToPixels(this._previousSegment.startTime + minSegmentDuration) -
                     this._view.getFrameOffset();

        if (lowerLimit < 0) {
          lowerLimit = 0;
        }

        var prevSegmentEndX = this._view.timeToPixels(this._previousSegment.endTime) -
                              this._view.getFrameOffset();

        if (pos.x < prevSegmentEndX && pos.x >= lowerLimit) {
          prevSegmentEndX = pos.x;
          time = this._view.pixelOffsetToTime(prevSegmentEndX);

          this._previousSegment.update({ endTime: time });
        }
      }
    }
    else {
      lowerLimit = 0;
    }
  }
  else {
    lowerLimit = this._startMarker.getX() + this._startMarker.getWidth();

    var width = this._view.getWidth();

    if (this._nextSegment) {
      dragMode = this._view.getSegmentDragMode();

      if (dragMode === 'no-overlap') {
        upperLimit = this._view.timeToPixels(this._nextSegment.startTime) -
                     this._view.getFrameOffset();

        if (upperLimit > width) {
          upperLimit = width;
        }
      }
      else if (dragMode === 'compress') {
        segmentDuration = this._nextSegment.endTime - this._nextSegment.startTime;

        if (segmentDuration < minSegmentDuration) {
          minSegmentDuration = segmentDuration;
        }

        upperLimit = this._view.timeToPixels(this._nextSegment.endTime - minSegmentDuration) -
                     this._view.getFrameOffset();

        if (upperLimit > width) {
          upperLimit = width;
        }

        var nextSegmentStartX = this._view.timeToPixels(this._nextSegment.startTime) -
                                this._view.getFrameOffset();

        if (pos.x > nextSegmentStartX && pos.x < upperLimit) {
          nextSegmentStartX = pos.x;
          time = this._view.pixelOffsetToTime(nextSegmentStartX);

          this._nextSegment.update({ startTime: time });
        }
      }
    }
    else {
      upperLimit = width;
    }
  }

  pos.x = clamp(pos.x, lowerLimit, upperLimit);

  // Allow the marker handle to be moved horizontally but not vertically.
  return {
    x: pos.x,
    y: 0
  };
};

SegmentShape.prototype.fitToView = function() {
  if (this._startMarker) {
    this._startMarker.fitToView();
  }

  if (this._endMarker) {
    this._endMarker.fitToView();
  }

  if (this._waveformShape) {
    this._waveformShape.setWaveformColor(this._color);
  }

  if (this._overlay) {
    var height = this._view.getHeight();

    var overlayRectHeight = clamp(0, height - (this._overlayOffset * 2));

    this._overlay.setAttrs({
      y:          0,
      height:     height,
      clipY:      this._overlayOffset,
      clipHeight: overlayRectHeight
    });

    this._overlayRect.setAttrs({
      y:      this._overlayOffset,
      height: overlayRectHeight
    });

    if (this._overlayText) {
      var segmentOptions = this._peaks.options.segmentOptions;

      if (segmentOptions.overlayLabelY + segmentOptions.overlayFontSize > overlayRectHeight) {
        this._overlayText.hide();
      }
      else {
        this._overlayText.show();
      }
    }
  }
};

SegmentShape.prototype.destroy = function() {
  if (this._waveformShape) {
    this._waveformShape.destroy();
  }

  if (this._label) {
    this._label.destroy();
  }

  if (this._startMarker) {
    this._startMarker.destroy();
  }

  if (this._endMarker) {
    this._endMarker.destroy();
  }

  if (this._overlay) {
    this._overlay.destroy();
  }
};

export default SegmentShape;
