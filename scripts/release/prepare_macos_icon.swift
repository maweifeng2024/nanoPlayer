import AppKit
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

guard CommandLine.arguments.count == 3 else {
  fputs("usage: prepare_macos_icon.swift INPUT OUTPUT\n", stderr)
  exit(2)
}

let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
guard
  let source = CGImageSourceCreateWithURL(inputURL as CFURL, nil),
  let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
  let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
  let context = CGContext(
    data: nil,
    width: 1024,
    height: 1024,
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: colorSpace,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  )
else {
  fputs("failed to read or prepare icon image\n", stderr)
  exit(1)
}

context.clear(CGRect(x: 0, y: 0, width: 1024, height: 1024))
let iconRect = CGRect(x: 95, y: 95, width: 834, height: 834)
let mask = CGPath(
  roundedRect: iconRect,
  cornerWidth: 205,
  cornerHeight: 205,
  transform: nil
)
context.addPath(mask)
context.clip()
context.interpolationQuality = .high
context.draw(image, in: CGRect(x: 0, y: 0, width: 1024, height: 1024))

guard
  let result = context.makeImage(),
  let destination = CGImageDestinationCreateWithURL(
    outputURL as CFURL,
    UTType.png.identifier as CFString,
    1,
    nil
  )
else {
  fputs("failed to create icon output\n", stderr)
  exit(1)
}

CGImageDestinationAddImage(destination, result, nil)
guard CGImageDestinationFinalize(destination) else {
  fputs("failed to write icon output\n", stderr)
  exit(1)
}
