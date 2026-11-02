// Prints the text that macOS Vision recognizes in an image, one observation per line.
// Usage: swift ocr-vision.swift <image-path>
import AppKit
import Foundation
import Vision

guard CommandLine.arguments.count == 2 else {
  FileHandle.standardError.write("usage: swift ocr-vision.swift <image-path>\n".data(using: .utf8)!)
  exit(2)
}
let path = CommandLine.arguments[1]
guard let image = NSImage(contentsOfFile: path),
  let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
else {
  FileHandle.standardError.write("cannot read image: \(path)\n".data(using: .utf8)!)
  exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans", "en-US"]
request.usesLanguageCorrection = false

do {
  try VNImageRequestHandler(cgImage: cgImage).perform([request])
} catch {
  FileHandle.standardError.write("vision failed: \(error)\n".data(using: .utf8)!)
  exit(1)
}
for observation in request.results ?? [] {
  if let candidate = observation.topCandidates(1).first {
    print(candidate.string)
  }
}
