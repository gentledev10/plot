import AppKit
import Foundation

let output = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
let background = "192b40"
let connection = "87b5f6"
let foreground = "f5f1e9"
enum Finish: String, CaseIterable {
  case flat, soft, satin

  var depth: CGFloat {
    switch self {
    case .flat: return 0
    case .soft: return 0.55
    case .satin: return 1
    }
  }
}
let tile = CGRect(x: 100, y: 100, width: 824, height: 824)
let cornerRadius: CGFloat = 184
let nodeRadius: CGFloat = 62
let lineWidth: CGFloat = 48
let nodes = [CGPoint(x: 236, y: 566), CGPoint(x: 380, y: 414), CGPoint(x: 784, y: 566)]
let curves = [
  (CGPoint(x: 260, y: 488), CGPoint(x: 304, y: 414), nodes[1]),
  (CGPoint(x: 528, y: 414), CGPoint(x: 644, y: 566), nodes[2]),
]

func coordinates(_ point: CGPoint) -> String {
  "\(Int(point.x)) \(Int(point.y))"
}

let pathData =
  "M \(coordinates(nodes[0])) "
  + curves.map {
    "C \(coordinates($0.0)) \(coordinates($0.1)) \(coordinates($0.2))"
  }.joined(separator: " ")
let circles = nodes.map {
  "    <circle cx=\"\(Int($0.x))\" cy=\"\(Int($0.y))\" r=\"\(Int(nodeRadius))\"/>"
}.joined(separator: "\n")
let svg = """
  <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-labelledby="title description">
    <title id="title">Plot</title>
    <desc id="description">Three events joined by one continuous story, with an early turning point. Follow the plot.</desc>
    <defs>
      <linearGradient id="tile" x1="0" y1="0" x2="0.7" y2="1">
        <stop stop-color="#304d6c"/>
        <stop offset="0.5" stop-color="#20364f"/>
        <stop offset="1" stop-color="#122035"/>
      </linearGradient>
      <linearGradient id="rim" x1="0" y1="0" x2="0.5" y2="1">
        <stop stop-color="#a9c7e8" stop-opacity="0.45"/>
        <stop offset="0.45" stop-color="#a9c7e8" stop-opacity="0.08"/>
        <stop offset="1" stop-color="#020914" stop-opacity="0.4"/>
      </linearGradient>
      <linearGradient id="line" gradientUnits="userSpaceOnUse" x1="380" y1="376" x2="400" y2="610">
        <stop stop-color="#c0ddff"/>
        <stop offset="0.45" stop-color="#\(connection)"/>
        <stop offset="1" stop-color="#548bdb"/>
      </linearGradient>
      <linearGradient id="node" x1="0" y1="0" x2="0.65" y2="1">
        <stop stop-color="#fffefa"/>
        <stop offset="0.5" stop-color="#f2f2ed"/>
        <stop offset="1" stop-color="#cbd3dd"/>
      </linearGradient>
      <linearGradient id="node-rim" x1="0" y1="0" x2="0" y2="1">
        <stop stop-color="#ffffff" stop-opacity="0.9"/>
        <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.1"/>
        <stop offset="1" stop-color="#748398" stop-opacity="0.5"/>
      </linearGradient>
      <filter id="tile-shadow" x="-0.2" y="-0.2" width="1.4" height="1.4">
        <feDropShadow dx="0" dy="9" stdDeviation="7" flood-color="#000916" flood-opacity="0.25"/>
      </filter>
      <filter id="symbol-shadow" x="-0.5" y="-0.5" width="2" height="2">
        <feDropShadow dx="0" dy="9" stdDeviation="7" flood-color="#000916" flood-opacity="0.45"/>
      </filter>
    </defs>
    <rect x="100" y="100" width="824" height="824" rx="\(Int(cornerRadius))" fill="url(#tile)" stroke="url(#rim)" stroke-width="2" filter="url(#tile-shadow)"/>
    <path d="\(pathData)" transform="translate(0 5)" fill="none" stroke="#315b92" stroke-width="\(Int(lineWidth))" stroke-linecap="round" filter="url(#symbol-shadow)"/>
    <path d="\(pathData)" fill="none" stroke="url(#line)" stroke-width="\(Int(lineWidth))" stroke-linecap="round"/>
    <g fill="#aebaca" transform="translate(0 5)" filter="url(#symbol-shadow)">
  \(circles)
    </g>
    <g fill="url(#node)" stroke="url(#node-rim)" stroke-width="2">
  \(circles)
    </g>
  </svg>

  """
func color(_ hex: String, alpha: CGFloat = 1) -> CGColor {
  let value = UInt32(hex, radix: 16)!
  return CGColor(
    srgbRed: CGFloat((value >> 16) & 255) / 255,
    green: CGFloat((value >> 8) & 255) / 255,
    blue: CGFloat(value & 255) / 255,
    alpha: alpha
  )
}

func gradient(_ colors: [CGColor], locations: [CGFloat]) -> CGGradient {
  CGGradient(
    colorsSpace: CGColorSpace(name: CGColorSpace.sRGB)!, colors: colors as CFArray,
    locations: locations)!
}

func render(_ finish: Finish) -> CGImage {
  let size = 1024
  let context = CGContext(
    data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4,
    space: CGColorSpace(name: CGColorSpace.sRGB)!,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  )!
  context.translateBy(x: 0, y: CGFloat(size))
  context.scaleBy(x: 1, y: -1)
  let depth = finish.depth
  let tilePath = CGPath(
    roundedRect: tile, cornerWidth: cornerRadius, cornerHeight: cornerRadius, transform: nil)
  let linePath = CGMutablePath()
  linePath.move(to: nodes[0])
  for (control1, control2, end) in curves {
    linePath.addCurve(to: end, control1: control1, control2: control2)
  }
  let ribbon = linePath.copy(
    strokingWithWidth: lineWidth, lineCap: .round, lineJoin: .round, miterLimit: 10)
  let nodePaths = nodes.map {
    CGPath(
      ellipseIn: CGRect(
        x: $0.x - nodeRadius, y: $0.y - nodeRadius, width: nodeRadius * 2, height: nodeRadius * 2),
      transform: nil)
  }

  func fill(_ path: CGPath, with fill: CGColor, shadow: CGFloat = 0) {
    context.saveGState()
    if shadow > 0 {
      context.setShadow(
        offset: CGSize(width: 0, height: -9 * depth), blur: 14 * depth,
        color: color("000916", alpha: shadow))
    }
    context.setFillColor(fill)
    context.addPath(path)
    context.fillPath()
    context.restoreGState()
  }

  func shade(_ path: CGPath, colors: [CGColor], locations: [CGFloat], from: CGPoint, to: CGPoint) {
    context.saveGState()
    context.addPath(path)
    context.clip()
    context.drawLinearGradient(
      gradient(colors, locations: locations), start: from, end: to,
      options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
    context.restoreGState()
  }

  func edge(_ path: CGPath, colors: [CGColor], from: CGPoint, to: CGPoint) {
    let outline = path.copy(strokingWithWidth: 2, lineCap: .round, lineJoin: .round, miterLimit: 10)
    shade(outline, colors: colors, locations: [0, 0.5, 1], from: from, to: to)
  }

  if finish == .flat {
    fill(tilePath, with: color(background))
    fill(ribbon, with: color(connection))
    for path in nodePaths { fill(path, with: color(foreground)) }
    return context.makeImage()!
  }

  fill(tilePath, with: color(background), shadow: 0.25 * depth)
  shade(
    tilePath, colors: [color("304d6c"), color("20364f"), color("122035")], locations: [0, 0.5, 1],
    from: CGPoint(x: 100, y: 100), to: CGPoint(x: 677, y: 924))
  edge(
    tilePath,
    colors: [
      color("a9c7e8", alpha: 0.45 * depth), color("a9c7e8", alpha: 0.08),
      color("020914", alpha: 0.4 * depth),
    ], from: CGPoint(x: 100, y: 100), to: CGPoint(x: 512, y: 924))

  var extrusion = CGAffineTransform(translationX: 0, y: 5 * depth)
  fill(ribbon.copy(using: &extrusion)!, with: color("315b92"), shadow: 0.4 * depth)
  shade(
    ribbon, colors: [color("c0ddff"), color(connection), color("548bdb")], locations: [0, 0.45, 1],
    from: CGPoint(x: 380, y: 376), to: CGPoint(x: 400, y: 610))
  edge(
    ribbon,
    colors: [
      color("e3f0ff", alpha: 0.65 * depth), color("c0ddff", alpha: 0.1),
      color("315b92", alpha: 0.4 * depth),
    ], from: CGPoint(x: 380, y: 376), to: CGPoint(x: 400, y: 610))

  for (index, path) in nodePaths.enumerated() {
    let node = nodes[index]
    fill(path.copy(using: &extrusion)!, with: color("aebaca"), shadow: 0.45 * depth)
    let from = CGPoint(x: node.x - nodeRadius, y: node.y - nodeRadius)
    let to = CGPoint(x: node.x + nodeRadius * 0.3, y: node.y + nodeRadius)
    shade(
      path, colors: [color("fffefa"), color("f2f2ed"), color("cbd3dd")], locations: [0, 0.5, 1],
      from: from, to: to)
    edge(
      path,
      colors: [
        color("ffffff", alpha: 0.9 * depth), color("ffffff", alpha: 0.1),
        color("748398", alpha: 0.5 * depth),
      ], from: from, to: to)
  }
  return context.makeImage()!
}

func png(image: CGImage, size: Int) -> Data {
  let context = CGContext(
    data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4,
    space: CGColorSpace(name: CGColorSpace.sRGB)!,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  )!
  context.interpolationQuality = .high
  context.draw(image, in: CGRect(x: 0, y: 0, width: size, height: size))
  return NSBitmapImageRep(cgImage: context.makeImage()!).representation(
    using: .png, properties: [:])!
}

if CommandLine.arguments.contains("--compare") {
  let destination = output.deletingLastPathComponent().appendingPathComponent("dist")
  try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
  let context = CGContext(
    data: nil, width: 1536, height: 544, bitsPerComponent: 8, bytesPerRow: 1536 * 4,
    space: CGColorSpace(name: CGColorSpace.sRGB)!,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  context.setFillColor(color("eceae6"))
  context.fill(CGRect(x: 0, y: 0, width: 1536, height: 544))
  for (index, finish) in Finish.allCases.enumerated() {
    let image = render(finish)
    try png(image: image, size: 1024).write(
      to: destination.appendingPathComponent("icon-\(finish.rawValue).png"))
    context.draw(image, in: CGRect(x: index * 512, y: 16, width: 512, height: 512))
  }
  let board = NSBitmapImageRep(cgImage: context.makeImage()!).representation(
    using: .png, properties: [:])!
  try board.write(to: destination.appendingPathComponent("icon-depth-comparison.png"))
  print("Generated dist/icon-depth-comparison.png (flat, soft, satin)")
  exit(0)
}

let master = render(.satin)
try svg.write(to: output.appendingPathComponent("icon.svg"), atomically: true, encoding: .utf8)
try png(image: master, size: 1024).write(to: output.appendingPathComponent("icon.png"))
let scratch = FileManager.default.temporaryDirectory.appendingPathComponent(
  "plot-icon-\(UUID().uuidString)")
let iconset = scratch.appendingPathComponent("Plot.iconset")
try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)
defer { try? FileManager.default.removeItem(at: scratch) }
for size in [16, 32, 128, 256, 512] {
  try png(image: master, size: size).write(
    to: iconset.appendingPathComponent("icon_\(size)x\(size).png"))
  try png(image: master, size: size * 2).write(
    to: iconset.appendingPathComponent("icon_\(size)x\(size)@2x.png"))
}
let conversion = Process()
conversion.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
conversion.arguments = [
  "-c", "icns", "-o", output.appendingPathComponent("icon.icns").path, iconset.path,
]
try conversion.run()
conversion.waitUntilExit()
guard conversion.terminationStatus == 0 else { exit(conversion.terminationStatus) }
print("Generated build/icon.svg, build/icon.png and build/icon.icns")
