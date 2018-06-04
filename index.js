'use strict';

// Native
const EventEmitter = require('events');

// Packages
const HID = require('node-hid');

const NUM_KEYS = 15;
const PAGE_PACKET_SIZE = 8017;
const ICON_SIZE = 72;
const NUM_TOTAL_PIXELS = 72*72*3;

class Infinitton extends EventEmitter {
	/**
	 * The pixel size of an icon written to the Stream Deck key.
	 *
	 * @readonly
	 */
	static get ICON_SIZE() {
		return ICON_SIZE;
	}

	/**
	 * Checks a value is a valid RGB value. A number between 0 and 255.
	 *
	 * @static
	 * @param {number} value The number to check
	 */
	static checkRGBValue(value) {
		if (value < 0 || value > 255) {
			throw new TypeError('Expected a valid color RGB value 0 - 255');
		}
	}

	/**
	 * Checks a keyIndex is a valid key for a device. A number between 0 and 14.
	 *
	 * @static
	 * @param {number} keyIndex The keyIndex to check
	 */
	static checkValidKeyIndex(keyIndex) {
		if (keyIndex < 0 || keyIndex > 14) {
			throw new TypeError('Expected a valid keyIndex 0 - 14');
		}
	}

	/**
	 * Pads a given buffer till padLength with 0s.
	 *
	 * @private
	 * @param {Buffer} buffer Buffer to pad
	 * @param {number} padLength The length to pad to
	 * @returns {Buffer} The Buffer padded to the length requested
	 */
	static padBufferToLength(buffer, padLength) {
		return Buffer.concat([buffer, Infinitton.createPadBuffer(padLength - buffer.length)]);
	}

	/**
	 * Returns an empty buffer (filled with zeroes) of the given length
	 *
	 * @private
	 * @param {number} padLength Length of the buffer
	 * @returns {Buffer}
	 */
	static createPadBuffer(padLength) {
		return Buffer.alloc(padLength);
	}

	/**
	 * Converts a buffer into an number[]. Used to supply the underlying
	 * node-hid device with the format it accepts.
	 *
	 * @static
	 * @param {Buffer} buffer Buffer to convert
	 * @returns {number[]} the converted buffer
	 */
	static bufferToIntArray(buffer) {
		const array = [];
		for (const pair of buffer.entries()) {
			array.push(pair[1]);
		}
		return array;
	}

	constructor(devicePath) {
		super();
		var self = this;

		if (typeof devicePath === 'undefined') {
			// Device path not provided, will then select any connected device.
			const devices = HID.devices();
			const connectedInfinittons = devices.filter(device => {
				return device.vendorId === 0xffff && device.productId === 0x1f40;
			});
			if (!connectedInfinittons.length) {
				throw new Error('No Infinittons are connected.');
			}
			this.device = new HID.HID(connectedInfinittons[0].path);
		} else {
			this.device = new HID.HID(devicePath);
		}

		this.keyState = new Array(NUM_KEYS).fill(false);

		function keyIsPressed(keyIndex, keyPressed) {
			const stateChanged = keyPressed !== self.keyState[keyIndex];
			if (stateChanged) {
				self.keyState[keyIndex] = keyPressed;
				if (keyPressed) {
					console.log("KEYPRESS: ", keyIndex);
					self.emit('down', keyIndex);
				} else {
					self.emit('up', keyIndex);
				}
			}
		}

		this.device.on('data', data => {

			console.log("DATA FROM infinitton; ", data);
			// The first byte is a report ID, the last byte appears to be padding.
			// We strip these out for now.
			data = data.slice(1, data.length - 1);

			// Row 1
			keyIsPressed(4, data[0] & 0x10);
			keyIsPressed(3, data[0] & 0x08);
			keyIsPressed(2, data[0] & 0x04);
			keyIsPressed(1, data[0] & 0x02);
			keyIsPressed(0, data[0] & 0x01);

			// Row 2
			keyIsPressed(9, data[1] & 0x02);
			keyIsPressed(8, data[1] & 0x01);
			keyIsPressed(7, data[0] & 0x80);
			keyIsPressed(6, data[0] & 0x40);
			keyIsPressed(5, data[0] & 0x20);

			// Row 3
			keyIsPressed(14, data[1] & 0x40);
			keyIsPressed(13, data[1] & 0x20);
			keyIsPressed(12, data[1] & 0x20);
			keyIsPressed(11, data[1] & 0x08);
			keyIsPressed(10, data[1] & 0x04);
		});

		this.device.on('error', err => {
			this.emit('error', err);
		});
	}

	/**
	 * Writes a Buffer to the Stream Deck.
	 *
	 * @param {Buffer} buffer The buffer written to the Stream Deck
	 * @returns undefined
	 */
	write(buffer) {
		return this.device.write(Infinitton.bufferToIntArray(buffer));
	}

	/**
	 * Sends a HID feature report to the Stream Deck.
	 *
	 * @param {Buffer} buffer The buffer send to the Stream Deck.
	 * @returns undefined
	 */
	sendFeatureReport(buffer) {
		return this.device.sendFeatureReport(Infinitton.bufferToIntArray(buffer));
	}

	/**
	 * Fills the given key with a solid color.
	 *
	 * @param {number} keyIndex The key to fill 0 - 14
	 * @param {number} r The color's red value. 0 - 255
	 * @param {number} g The color's green value. 0 - 255
	 * @param {number} b The color's blue value. 0 -255
	 */
	fillColor(keyIndex, r, g, b) {
		Infinitton.checkValidKeyIndex(keyIndex);

		Infinitton.checkRGBValue(r);
		Infinitton.checkRGBValue(g);
		Infinitton.checkRGBValue(b);

		const pixel = Buffer.from([b, g, r]);
		this._writePage1(keyIndex, Buffer.alloc(7946, pixel));
		// First page stops just before r
		const pixel2 = Buffer.from([r, b, g]);
		this._writePage2(keyIndex, Buffer.alloc(7606, pixel2));

		this.device.sendFeatureReport([0, 0x12, 0x01, 0x00, 0x00, keyIndex + 1, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf6, 0x3c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
	}

	/**
	 * Fills the given key with an image in a Buffer.
	 *
	 * @param {number} keyIndex The key to fill 0 - 14
	 * @param {Buffer} imageBuffer
	 */
	fillImage(keyIndex, imageBuffer) {
		Infinitton.checkValidKeyIndex(keyIndex);

		if (imageBuffer.length !== 15552) {
			throw new RangeError(`Expected image buffer of length 15552, got length ${imageBuffer.length}`);
		}

		let pixels = [];
		for (let r = 0; r < ICON_SIZE; r++) {
			const row = [];
			const start = r * 3 * ICON_SIZE;
			for (let i = start; i < start + (ICON_SIZE * 3); i += 3) {
				const r = imageBuffer.readUInt8(i);
				const g = imageBuffer.readUInt8(i + 1);
				const b = imageBuffer.readUInt8(i + 2);
				row.push(r, g, b);
			}
			pixels = pixels.concat(row.reverse());
		}

		const firstPagePixels = pixels.slice(0, 7946);
		const secondPagePixels = pixels.slice(7946, NUM_TOTAL_PIXELS * 3);
		this._writePage1(keyIndex, Buffer.from(firstPagePixels));
		this._writePage2(keyIndex, Buffer.from(secondPagePixels));
		this.device.sendFeatureReport([0, 0x12, 0x01, 0x00, 0x00, keyIndex+1, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf6, 0x3c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
	}

	/**
	 * Clears the given key.
	 *
	 * @param {number} keyIndex The key to clear 0 - 14
	 * @returns {undefined}
	 */
	clearKey(keyIndex) {
		Infinitton.checkValidKeyIndex(keyIndex);
		return this.fillColor(keyIndex, 0x33, 0x66, 0x88);
	}

	/**
	 * Clears all keys.
	 *
	 * returns {undefined}
	 */
	clearAllKeys() {
		for (let keyIndex = 0; keyIndex < NUM_KEYS; keyIndex++) {
			this.clearKey(keyIndex);
		}
	}

	/**
	 * Sets the brightness of the keys on the Stream Deck
	 *
	 * @param {number} percentage The percentage brightness
	 */
	setBrightness(percentage) {
		if (percentage < 0 || percentage > 100) {
			throw new RangeError('Expected brightness percentage to be between 0 and 100');
		}

		const brightnessCommandBuffer = Buffer.from([0x00, 0x11, percentage]);
		this.sendFeatureReport(brightnessCommandBuffer);
	}

	/**
	 * Writes a Stream Deck's page 1 headers and image data to the Stream Deck.
	 *
	 * @private
	 * @param {number} keyIndex The key to write to 0 - 14
	 * @param {Buffer} buffer Image data for page 1
	 * @returns {undefined}
	 */
	_writePage1(keyIndex, buffer) {
		const header = Buffer.from([
			0x02, 0x00, 0x00, 0x00, 0x00, 0x40, 0x1f, 0x00, 0x00, 0x55, 0xaa, 0xaa, 0x55, 0x11, 0x22, 0x33,
			0x44, 0x42, 0x4d, 0xf6, 0x3c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x36, 0x00, 0x00, 0x00, 0x28,
			0x00, 0x00, 0x00, 0x48, 0x00, 0x00, 0x00, 0x48, 0x00, 0x00, 0x00, 0x01, 0x00, 0x18, 0x00, 0x00,
			0x00, 0x00, 0x00, 0xc0, 0x3c, 0x00, 0x00, 0x13, 0x0b, 0x00, 0x00, 0x13, 0x0b, 0x00, 0x00, 0x00,
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
		]);

		const packet = Infinitton.padBufferToLength(Buffer.concat([header, buffer]), PAGE_PACKET_SIZE);
		return this.write(packet);
	}

	/**
	 * Writes a Stream Deck's page 2 headers and image data to the Stream Deck.
	 *
	 * @private
	 * @param {number} keyIndex The key to write to 0 - 14
	 * @param {Buffer} buffer Image data for page 2
	 * @returns {undefined}
	 */

	_writePage2(keyIndex, buffer) {
		const header = Buffer.from([
			0x02, 0x40, 0x1f, 0x00, 0x00, 0xb6, 0x1d, 0x00, 0x00, 0x55, 0xaa, 0xaa, 0x55, 0x11, 0x22, 0x33, 0x44
		]);

		const packet = Infinitton.padBufferToLength(Buffer.concat([header, buffer]), PAGE_PACKET_SIZE);
		return this.write(packet);
	}
}

module.exports = Infinitton;
