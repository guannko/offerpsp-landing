import AppKit
import AVFoundation
import AudioToolbox
import CoreMedia
import CoreVideo

private let framesPerSecond: Int32 = 30
private let durationSeconds = 15.5
private let audioSampleRate: Int32 = 48_000
private let audioChannels: UInt32 = 2

private struct OutputPreset {
    let name: String
    let width: Int
    let height: Int
    let bitrate: Int
}

private let presets = [
    OutputPreset(name: "offerpsp-merchant-brief-vertical-clean", width: 1080, height: 1920, bitrate: 8_000_000),
    OutputPreset(name: "offerpsp-merchant-brief-linkedin-clean", width: 1080, height: 1350, bitrate: 6_000_000),
]

private let dark = NSColor(calibratedRed: 0.031, green: 0.039, blue: 0.075, alpha: 1)
private let darkAlt = NSColor(calibratedRed: 0.105, green: 0.043, blue: 0.105, alpha: 1)
private let cream = NSColor(calibratedRed: 1.0, green: 0.98, blue: 0.955, alpha: 1)
private let muted = NSColor(calibratedRed: 0.76, green: 0.78, blue: 0.83, alpha: 1)
private let pink = NSColor(calibratedRed: 1.0, green: 0.278, blue: 0.471, alpha: 1)
private let pinkSoft = NSColor(calibratedRed: 1.0, green: 0.47, blue: 0.60, alpha: 1)

private func clamp(_ value: Double, _ minimum: Double = 0, _ maximum: Double = 1) -> Double {
    Swift.max(minimum, Swift.min(maximum, value))
}

private func smoothstep(_ value: Double) -> Double {
    let x = clamp(value)
    return x * x * (3 - 2 * x)
}

private func easeOut(_ value: Double) -> Double {
    let x = clamp(value)
    return 1 - pow(1 - x, 3)
}

private func sceneVisibility(_ time: Double, start: Double, end: Double, fade: Double = 0.28) -> Double {
    let fadeIn = smoothstep((time - start) / fade)
    let fadeOut = smoothstep((end - time) / fade)
    return Swift.min(fadeIn, fadeOut)
}

private func font(_ size: CGFloat, weight: NSFont.Weight = .regular, condensed: Bool = false) -> NSFont {
    if condensed, let chosen = NSFont(name: "Arial Narrow Bold", size: size) {
        return chosen
    }
    return NSFont.systemFont(ofSize: size, weight: weight)
}

private func drawText(
    _ text: String,
    in rect: NSRect,
    size: CGFloat,
    weight: NSFont.Weight,
    color: NSColor,
    alpha: Double = 1,
    alignment: NSTextAlignment = .left,
    lineHeight: CGFloat? = nil,
    kern: CGFloat = 0
) {
    guard alpha > 0.001 else { return }
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = alignment
    paragraph.lineBreakMode = .byWordWrapping
    if let lineHeight {
        paragraph.minimumLineHeight = lineHeight
        paragraph.maximumLineHeight = lineHeight
    }
    let attributes: [NSAttributedString.Key: Any] = [
        .font: font(size, weight: weight),
        .foregroundColor: color.withAlphaComponent(alpha),
        .paragraphStyle: paragraph,
        .kern: kern,
    ]
    (text as NSString).draw(in: rect, withAttributes: attributes)
}

private func roundedRect(_ rect: NSRect, radius: CGFloat, fill: NSColor, stroke: NSColor? = nil, lineWidth: CGFloat = 1) {
    let path = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
    fill.setFill()
    path.fill()
    if let stroke {
        stroke.setStroke()
        path.lineWidth = lineWidth
        path.stroke()
    }
}

private func drawArrow(from start: NSPoint, to end: NSPoint, color: NSColor, alpha: Double) {
    guard alpha > 0.001 else { return }
    let path = NSBezierPath()
    path.move(to: start)
    path.line(to: end)
    path.lineWidth = 4
    path.lineCapStyle = .round
    color.withAlphaComponent(alpha).setStroke()
    path.stroke()

    let angle = atan2(end.y - start.y, end.x - start.x)
    let length: CGFloat = 14
    let wing = CGFloat.pi * 0.78
    let head = NSBezierPath()
    head.move(to: end)
    head.line(to: NSPoint(x: end.x + length * cos(angle + wing), y: end.y + length * sin(angle + wing)))
    head.move(to: end)
    head.line(to: NSPoint(x: end.x + length * cos(angle - wing), y: end.y + length * sin(angle - wing)))
    head.lineWidth = 4
    head.lineCapStyle = .round
    color.withAlphaComponent(alpha).setStroke()
    head.stroke()
}

private func drawBackground(width: CGFloat, height: CGFloat, time: Double) {
    NSGradient(starting: dark, ending: darkAlt)?.draw(in: NSRect(x: 0, y: 0, width: width, height: height), angle: -58)

    NSColor.white.withAlphaComponent(0.032).setStroke()
    let grid = NSBezierPath()
    let step: CGFloat = 54
    var x: CGFloat = 0
    while x <= width {
        grid.move(to: NSPoint(x: x, y: 0))
        grid.line(to: NSPoint(x: x, y: height))
        x += step
    }
    var y: CGFloat = 0
    while y <= height {
        grid.move(to: NSPoint(x: 0, y: y))
        grid.line(to: NSPoint(x: width, y: y))
        y += step
    }
    grid.lineWidth = 1
    grid.stroke()

    let drift = CGFloat(sin(time * 0.42))
    let glowA = NSRect(x: width * 0.68 + drift * 36, y: height * 0.08, width: 430, height: 430)
    let glowB = NSRect(x: -170 + drift * 24, y: height * 0.64, width: 520, height: 520)
    NSColor(calibratedRed: 1, green: 0.25, blue: 0.47, alpha: 0.06).setFill()
    NSBezierPath(ovalIn: glowA).fill()
    NSColor(calibratedRed: 1, green: 0.47, blue: 0.65, alpha: 0.035).setFill()
    NSBezierPath(ovalIn: glowB).fill()

    pink.setFill()
    NSRect(x: 0, y: 0, width: 14, height: height).fill()
}

private func drawEnergy(width: CGFloat, height: CGFloat, time: Double) {
    let beatPeriod = 60.0 / 128.0
    let beatPhase = time.truncatingRemainder(dividingBy: beatPeriod)
    let pulse = exp(-beatPhase * 7.0)
    let ringSize = CGFloat(360 + pulse * 90)
    let ring = NSBezierPath(ovalIn: NSRect(x: width * 0.5 - ringSize / 2, y: height * 0.5 - ringSize / 2, width: ringSize, height: ringSize))
    pinkSoft.withAlphaComponent(0.025 + pulse * 0.035).setStroke()
    ring.lineWidth = 3
    ring.stroke()

    let travel = CGFloat((time * 430).truncatingRemainder(dividingBy: Double(width + 500))) - 250
    for index in 0..<5 {
        let x = travel + CGFloat(index) * 240
        let streak = NSBezierPath()
        streak.move(to: NSPoint(x: x, y: height * 0.22))
        streak.line(to: NSPoint(x: x + 130, y: height * 0.12))
        streak.lineWidth = CGFloat(2 + index % 2)
        pinkSoft.withAlphaComponent(0.055).setStroke()
        streak.stroke()
    }

    for transition in [2.05, 5.45, 8.15, 12.0] {
        let local = time - transition
        if local >= 0, local <= 0.22 {
            let flash = sin(local / 0.22 * Double.pi)
            NSColor.white.withAlphaComponent(0.055 * flash).setFill()
            NSRect(x: 0, y: 0, width: width, height: height).fill()
            pink.withAlphaComponent(0.38 * flash).setFill()
            NSRect(x: 0, y: height * 0.46, width: width * CGFloat(easeOut(local / 0.22)), height: 12).fill()
        }
    }
}

private func drawChrome(width: CGFloat, height: CGFloat, time: Double) {
    let top = height > 1500 ? CGFloat(128) : CGFloat(78)
    drawText("OfferPSP", in: NSRect(x: 78, y: top, width: 420, height: 70), size: 45, weight: .black, color: cream)
    drawText("PRIVATE PSP MATCHING", in: NSRect(x: width - 420, y: top + 12, width: 340, height: 40), size: 20, weight: .bold, color: pinkSoft, alignment: .right, kern: 2.1)

    let footerY = height - (height > 1500 ? 152 : 104)
    NSColor.white.withAlphaComponent(0.12).setStroke()
    let rule = NSBezierPath()
    rule.move(to: NSPoint(x: 78, y: footerY - 26))
    rule.line(to: NSPoint(x: width - 78, y: footerY - 26))
    rule.lineWidth = 1
    rule.stroke()
    drawText("Structured briefs before introductions", in: NSRect(x: 78, y: footerY, width: 580, height: 42), size: 24, weight: .semibold, color: muted)
    drawText("offerpsp.com", in: NSRect(x: width - 380, y: footerY, width: 302, height: 42), size: 24, weight: .bold, color: pinkSoft, alignment: .right)

    let progressWidth = (width - 156) * CGFloat(clamp(time / durationSeconds))
    roundedRect(NSRect(x: 78, y: footerY + 54, width: width - 156, height: 5), radius: 2.5, fill: NSColor.white.withAlphaComponent(0.08))
    roundedRect(NSRect(x: 78, y: footerY + 54, width: progressWidth, height: 5), radius: 2.5, fill: pink)
}

private func drawSceneOne(width: CGFloat, height: CGFloat, time: Double) {
    let alpha = sceneVisibility(time, start: 0, end: 2.35)
    guard alpha > 0 else { return }
    let compact = height < 1500
    let baseY = compact ? CGFloat(260) : CGFloat(460)
    let first = easeOut(time / 0.34)
    let second = easeOut((time - 0.28) / 0.34)
    let third = easeOut((time - 0.95) / 0.34)
    drawText("WE NEED", in: NSRect(x: 78 + CGFloat((1 - first) * -170), y: baseY, width: width - 156, height: 105), size: compact ? 70 : 82, weight: .black, color: cream, alpha: alpha * first, kern: -1.2)
    drawText("A PSP", in: NSRect(x: 78 + CGFloat((1 - second) * 190), y: baseY + (compact ? 82 : 98), width: width - 156, height: 145), size: compact ? 105 : 122, weight: .black, color: pinkSoft, alpha: alpha * second, kern: -2.0)
    roundedRect(NSRect(x: 80, y: baseY + (compact ? 218 : 256), width: CGFloat(410 * second), height: 11), radius: 5.5, fill: pink.withAlphaComponent(alpha * second))
    drawText("is only the starting point.", in: NSRect(x: 80, y: baseY + (compact ? 264 : 310) + CGFloat((1 - third) * 25), width: width - 160, height: 92), size: compact ? 48 : 56, weight: .semibold, color: muted, alpha: alpha * third)
}

private func drawSceneTwo(width: CGFloat, height: CGFloat, time: Double) {
    let start = 2.05
    let alpha = sceneVisibility(time, start: start, end: 5.75)
    guard alpha > 0 else { return }
    let compact = height < 1500
    let titleY = compact ? CGFloat(238) : CGFloat(380)
    drawText("A MATCHABLE BRIEF INCLUDES", in: NSRect(x: 80, y: titleY, width: width - 160, height: 55), size: compact ? 28 : 31, weight: .bold, color: pinkSoft, alpha: alpha, kern: 2.5)

    let labels = ["ENTITY", "LICENCE", "GEOs", "VERTICAL", "CURRENCIES", "METHODS", "VOLUME", "TICKET", "SETTLEMENT", "TRAFFIC", "INTEGRATION"]
    let columns = 3
    let gap: CGFloat = 18
    let left: CGFloat = 78
    let chipWidth = (width - left * 2 - gap * CGFloat(columns - 1)) / CGFloat(columns)
    let chipHeight: CGFloat = compact ? 92 : 108
    let top = titleY + (compact ? 86 : 112)

    for (index, label) in labels.enumerated() {
        let delay = Double(index) * 0.075
        let local = easeOut((time - start - 0.22 - delay) / 0.32)
        let row = index / columns
        let column = index % columns
        let x = left + CGFloat(column) * (chipWidth + gap)
        let y = top + CGFloat(row) * (chipHeight + gap) + CGFloat((1 - local) * 24)
        let chipAlpha = alpha * local
        roundedRect(
            NSRect(x: x, y: y, width: chipWidth, height: chipHeight),
            radius: 18,
            fill: NSColor.white.withAlphaComponent(0.055 * chipAlpha),
            stroke: pinkSoft.withAlphaComponent(0.34 * chipAlpha),
            lineWidth: 1.5
        )
        drawText(label, in: NSRect(x: x + 12, y: y + chipHeight / 2 - 17, width: chipWidth - 24, height: 38), size: compact ? 22 : 24, weight: .bold, color: cream, alpha: chipAlpha, alignment: .center, kern: 1.1)
    }
}

private func drawSceneThree(width: CGFloat, height: CGFloat, time: Double) {
    let start = 5.45
    let alpha = sceneVisibility(time, start: start, end: 8.5)
    guard alpha > 0 else { return }
    let compact = height < 1500
    let top = compact ? CGFloat(296) : CGFloat(490)
    let move = CGFloat((1 - easeOut((time - start) / 0.38)) * 95)
    drawText("OfferPSP structures", in: NSRect(x: 80 + move, y: top, width: width - 160, height: 105), size: compact ? 68 : 78, weight: .black, color: cream, alpha: alpha, kern: -1)
    drawText("the merchant dossier.", in: NSRect(x: 80 + move, y: top + (compact ? 86 : 100), width: width - 160, height: 105), size: compact ? 68 : 78, weight: .black, color: cream, alpha: alpha, kern: -1)

    let lineY = top + (compact ? 235 : 300)
    let lineProgress = easeOut((time - start - 0.28) / 0.52)
    roundedRect(NSRect(x: 82, y: lineY, width: (width - 164) * CGFloat(lineProgress), height: 8), radius: 4, fill: pink.withAlphaComponent(alpha))
    drawText("Clear operating context before provider review.", in: NSRect(x: 82, y: lineY + 44, width: width - 164, height: 60), size: compact ? 29 : 34, weight: .medium, color: muted, alpha: alpha)
}

private func drawSceneFour(width: CGFloat, height: CGFloat, time: Double) {
    let start = 8.15
    let alpha = sceneVisibility(time, start: start, end: 12.35)
    guard alpha > 0 else { return }
    let compact = height < 1500
    let titleY = compact ? CGFloat(220) : CGFloat(330)
    drawText("FROM FIT TO INTRODUCTION", in: NSRect(x: 80, y: titleY, width: width - 160, height: 50), size: compact ? 28 : 31, weight: .bold, color: pinkSoft, alpha: alpha, kern: 2.2)

    let steps = [
        ("01", "Qualified fit"),
        ("02", "Provider review"),
        ("03", "Provider accepts"),
        ("04", "Controlled introduction"),
    ]
    let top = titleY + (compact ? 76 : 110)
    let cardHeight: CGFloat = compact ? 126 : 155
    let gap: CGFloat = compact ? 16 : 22
    for (index, step) in steps.enumerated() {
        let local = easeOut((time - start - 0.16 - Double(index) * 0.25) / 0.36)
        let y = top + CGFloat(index) * (cardHeight + gap) + CGFloat((1 - local) * 25)
        let cardAlpha = alpha * local
        roundedRect(
            NSRect(x: 78, y: y, width: width - 156, height: cardHeight),
            radius: 22,
            fill: NSColor.white.withAlphaComponent(0.052 * cardAlpha),
            stroke: NSColor.white.withAlphaComponent(0.10 * cardAlpha),
            lineWidth: 1
        )
        roundedRect(NSRect(x: 102, y: y + cardHeight / 2 - 25, width: 74, height: 50), radius: 15, fill: pink.withAlphaComponent(0.92 * cardAlpha))
        drawText(step.0, in: NSRect(x: 102, y: y + cardHeight / 2 - 16, width: 74, height: 34), size: 22, weight: .black, color: cream, alpha: cardAlpha, alignment: .center)
        drawText(step.1, in: NSRect(x: 205, y: y + cardHeight / 2 - 24, width: width - 320, height: 52), size: compact ? 35 : 39, weight: .bold, color: cream, alpha: cardAlpha)
        if index < steps.count - 1 {
            let arrowAlpha = alpha * easeOut((time - start - 0.38 - Double(index) * 0.25) / 0.32)
            drawArrow(from: NSPoint(x: width - 118, y: y + cardHeight + 2), to: NSPoint(x: width - 118, y: y + cardHeight + gap - 2), color: pinkSoft, alpha: arrowAlpha)
        }
    }
    let noteY = top + CGFloat(steps.count) * (cardHeight + gap) + (compact ? 6 : 12)
    drawText("Provider identity remains private until acceptance.", in: NSRect(x: 80, y: noteY, width: width - 160, height: 52), size: compact ? 25 : 29, weight: .semibold, color: muted, alpha: alpha, alignment: .center)
}

private func drawSceneFive(width: CGFloat, height: CGFloat, time: Double) {
    let start = 12.0
    let alpha = sceneVisibility(time, start: start, end: durationSeconds + 0.1, fade: 0.3)
    guard alpha > 0 else { return }
    let compact = height < 1500
    let top = compact ? CGFloat(300) : CGFloat(520)
    let move = CGFloat((1 - easeOut((time - start) / 0.38)) * 72)
    drawText("Better input", in: NSRect(x: 78 + move, y: top, width: width - 156, height: 110), size: compact ? 80 : 92, weight: .black, color: cream, alpha: alpha, alignment: .center, kern: -1.5)
    drawText("speeds review.", in: NSRect(x: 78 + move, y: top + (compact ? 92 : 110), width: width - 156, height: 110), size: compact ? 80 : 92, weight: .black, color: cream, alpha: alpha, alignment: .center, kern: -1.5)
    drawText("It never guarantees approval.", in: NSRect(x: 78, y: top + (compact ? 232 : 280), width: width - 156, height: 68), size: compact ? 36 : 42, weight: .semibold, color: pinkSoft, alpha: alpha, alignment: .center)
    roundedRect(NSRect(x: width / 2 - 92, y: top + (compact ? 332 : 410), width: 184, height: 8), radius: 4, fill: pink.withAlphaComponent(alpha))
}

private func renderFrame(into baseAddress: UnsafeMutableRawPointer, preset: OutputPreset, time: Double) throws {
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let context = CGContext(
        data: baseAddress,
        width: preset.width,
        height: preset.height,
        bitsPerComponent: 8,
        bytesPerRow: preset.width * 4,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
    ) else {
        throw NSError(domain: "OfferPSPVideo", code: 2, userInfo: [NSLocalizedDescriptionKey: "Could not create frame context"])
    }

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: true)
    let width = CGFloat(preset.width)
    let height = CGFloat(preset.height)
    drawBackground(width: width, height: height, time: time)
    drawEnergy(width: width, height: height, time: time)
    drawChrome(width: width, height: height, time: time)
    drawSceneOne(width: width, height: height, time: time)
    drawSceneTwo(width: width, height: height, time: time)
    drawSceneThree(width: width, height: height, time: time)
    drawSceneFour(width: width, height: height, time: time)
    drawSceneFive(width: width, height: height, time: time)
    NSGraphicsContext.restoreGraphicsState()
}

private func createAudioFormatDescription() throws -> CMAudioFormatDescription {
    var description = AudioStreamBasicDescription(
        mSampleRate: Double(audioSampleRate),
        mFormatID: kAudioFormatLinearPCM,
        mFormatFlags: kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked,
        mBytesPerPacket: audioChannels * UInt32(MemoryLayout<Float>.size),
        mFramesPerPacket: 1,
        mBytesPerFrame: audioChannels * UInt32(MemoryLayout<Float>.size),
        mChannelsPerFrame: audioChannels,
        mBitsPerChannel: 32,
        mReserved: 0
    )
    var format: CMAudioFormatDescription?
    let status = CMAudioFormatDescriptionCreate(
        allocator: kCFAllocatorDefault,
        asbd: &description,
        layoutSize: 0,
        layout: nil,
        magicCookieSize: 0,
        magicCookie: nil,
        extensions: nil,
        formatDescriptionOut: &format
    )
    guard status == noErr, let format else {
        throw NSError(domain: "OfferPSPVideo", code: Int(status), userInfo: [NSLocalizedDescriptionKey: "Could not create audio format"])
    }
    return format
}

private func audioAmplitude(at time: Double) -> (Float, Float) {
    let fadeIn = smoothstep(time / 1.1)
    let fadeOut = smoothstep((durationSeconds - time) / 1.35)
    let envelope = fadeIn * fadeOut
    let twoPi = Double.pi * 2
    let pad = sin(twoPi * 110 * time) * 0.020
        + sin(twoPi * 164.81 * time + 0.4) * 0.012
        + sin(twoPi * 220 * time + 1.1) * 0.006

    let transitionTimes = [0.0, 2.8, 7.65, 11.8, 17.75]
    var accent = 0.0
    for transition in transitionTimes {
        let delta = time - transition
        if delta >= 0, delta < 0.8 {
            accent += sin(twoPi * (520 + 160 * delta) * delta) * exp(-delta * 7.5) * 0.035
        }
    }
    let movement = sin(twoPi * 0.09 * time) * 0.12
    let signal = (pad + accent) * envelope
    return (Float(signal * (1 - movement)), Float(signal * (1 + movement)))
}

private func makeAudioSampleBuffer(startFrame: Int64, frameCount: Int, format: CMAudioFormatDescription) throws -> CMSampleBuffer {
    let sampleCount = frameCount * Int(audioChannels)
    let byteCount = sampleCount * MemoryLayout<Float>.size
    guard let memory = CFAllocatorAllocate(kCFAllocatorDefault, byteCount, 0) else {
        throw NSError(domain: "OfferPSPVideo", code: 3, userInfo: [NSLocalizedDescriptionKey: "Could not allocate audio memory"])
    }
    let pointer = memory.bindMemory(to: Float.self, capacity: sampleCount)
    for frame in 0..<frameCount {
        let absoluteFrame = startFrame + Int64(frame)
        let time = Double(absoluteFrame) / Double(audioSampleRate)
        let (left, right) = audioAmplitude(at: time)
        pointer[frame * 2] = left
        pointer[frame * 2 + 1] = right
    }

    var blockBuffer: CMBlockBuffer?
    let blockStatus = CMBlockBufferCreateWithMemoryBlock(
        allocator: kCFAllocatorDefault,
        memoryBlock: memory,
        blockLength: byteCount,
        blockAllocator: kCFAllocatorDefault,
        customBlockSource: nil,
        offsetToData: 0,
        dataLength: byteCount,
        flags: 0,
        blockBufferOut: &blockBuffer
    )
    guard blockStatus == kCMBlockBufferNoErr, let blockBuffer else {
        CFAllocatorDeallocate(kCFAllocatorDefault, memory)
        throw NSError(domain: "OfferPSPVideo", code: Int(blockStatus), userInfo: [NSLocalizedDescriptionKey: "Could not create audio block"])
    }

    var timing = CMSampleTimingInfo(
        duration: CMTime(value: 1, timescale: audioSampleRate),
        presentationTimeStamp: CMTime(value: startFrame, timescale: audioSampleRate),
        decodeTimeStamp: .invalid
    )
    var sampleSize = Int(audioChannels) * MemoryLayout<Float>.size
    var sampleBuffer: CMSampleBuffer?
    let sampleStatus = CMSampleBufferCreateReady(
        allocator: kCFAllocatorDefault,
        dataBuffer: blockBuffer,
        formatDescription: format,
        sampleCount: frameCount,
        sampleTimingEntryCount: 1,
        sampleTimingArray: &timing,
        sampleSizeEntryCount: 1,
        sampleSizeArray: &sampleSize,
        sampleBufferOut: &sampleBuffer
    )
    guard sampleStatus == noErr, let sampleBuffer else {
        throw NSError(domain: "OfferPSPVideo", code: Int(sampleStatus), userInfo: [NSLocalizedDescriptionKey: "Could not create audio sample"])
    }
    return sampleBuffer
}

private func waitUntilReady(_ input: AVAssetWriterInput, writer: AVAssetWriter) throws {
    while !input.isReadyForMoreMediaData {
        if writer.status == .failed {
            throw writer.error ?? NSError(domain: "OfferPSPVideo", code: 4, userInfo: [NSLocalizedDescriptionKey: "Asset writer failed"])
        }
        Thread.sleep(forTimeInterval: 0.001)
    }
}

private func renderVideo(_ preset: OutputPreset, outputDirectory: URL) throws {
    let outputURL = outputDirectory.appendingPathComponent("\(preset.name).mp4")
    if FileManager.default.fileExists(atPath: outputURL.path) {
        try FileManager.default.removeItem(at: outputURL)
    }

    let encoder = Process()
    encoder.executableURL = URL(fileURLWithPath: "/opt/homebrew/bin/ffmpeg")
    encoder.arguments = [
        "-hide_banner", "-loglevel", "warning",
        "-f", "rawvideo",
        "-pixel_format", "bgra",
        "-video_size", "\(preset.width)x\(preset.height)",
        "-framerate", String(framesPerSecond),
        "-i", "pipe:0",
        "-map", "0:v:0",
        "-vf", "vflip",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "18",
        "-profile:v", "high",
        "-pix_fmt", "yuv420p",
        "-r", String(framesPerSecond),
        "-an",
        "-movflags", "+faststart",
        "-y", outputURL.path,
    ]
    let inputPipe = Pipe()
    encoder.standardInput = inputPipe
    try encoder.run()

    let totalFrames = Int(durationSeconds * Double(framesPerSecond))
    let frameByteCount = preset.width * preset.height * 4
    for frame in 0..<totalFrames {
        try autoreleasepool {
            var frameData = Data(count: frameByteCount)
            try frameData.withUnsafeMutableBytes { bytes in
                guard let baseAddress = bytes.baseAddress else {
                    throw NSError(domain: "OfferPSPVideo", code: 7, userInfo: [NSLocalizedDescriptionKey: "Could not allocate raw video frame"])
                }
                try renderFrame(into: baseAddress, preset: preset, time: Double(frame) / Double(framesPerSecond))
            }
            try inputPipe.fileHandleForWriting.write(contentsOf: frameData)
        }
        if frame % 90 == 0 {
            print("  \(preset.name): frame \(frame)/\(totalFrames)")
        }
    }
    try inputPipe.fileHandleForWriting.close()
    encoder.waitUntilExit()
    guard encoder.terminationStatus == 0 else {
        throw NSError(domain: "OfferPSPVideo", code: Int(encoder.terminationStatus), userInfo: [NSLocalizedDescriptionKey: "ffmpeg could not create the social MP4"])
    }
    print("Rendered \(outputURL.path)")
}

let outputDirectory = URL(fileURLWithPath: CommandLine.arguments.dropFirst().first ?? FileManager.default.currentDirectoryPath)
try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

do {
    for preset in presets {
        try renderVideo(preset, outputDirectory: outputDirectory)
    }
} catch {
    FileHandle.standardError.write(Data("Render failed: \(error)\n".utf8))
    exit(1)
}
