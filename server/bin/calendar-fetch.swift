import EventKit
import Foundation

func hexForColor(_ cgColor: CGColor?) -> String {
    guard let comps = cgColor?.components, comps.count >= 3 else { return "#6B7280" }
    let clamp: (CGFloat) -> Int = { Int((max(0, min(1, $0.isNaN ? 0 : $0))) * 255) }
    return String(format: "#%02X%02X%02X", clamp(comps[0]), clamp(comps[1]), clamp(comps[2]))
}

func requestAccess(_ store: EKEventStore) -> Bool {
    let semaphore = DispatchSemaphore(value: 0)
    var granted = false
    if #available(macOS 14, *) {
        store.requestFullAccessToEvents { ok, _ in
            granted = ok
            semaphore.signal()
        }
    } else {
        store.requestAccess(to: .event) { ok, _ in
            granted = ok
            semaphore.signal()
        }
    }
    semaphore.wait()
    return granted
}

func emit(_ obj: Any) {
    let data = try! JSONSerialization.data(withJSONObject: obj, options: [])
    FileHandle.standardOutput.write(data)
}

func fail(_ msg: String) -> Never {
    emit(["error": msg])
    exit(1)
}

let args = CommandLine.arguments
let mode = args.count > 1 ? args[1] : ""

let store = EKEventStore()
if !requestAccess(store) {
    fail("Calendar access denied. Grant access in System Settings → Privacy & Security → Calendars.")
}

let formatter = ISO8601DateFormatter()
formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

switch mode {
case "calendars":
    let cals = store.calendars(for: .event)
    let result: [[String: Any]] = cals.map { cal in
        ["name": cal.title, "color": hexForColor(cal.cgColor)]
    }
    emit(result)

case "events":
    guard args.count >= 3, let daysAhead = Int(args[2]) else {
        fail("usage: events <daysAhead> <calendar names...>")
    }
    let requestedNames = Array(args.dropFirst(3))
    let allCals = store.calendars(for: .event)
    let nameSet = Set(requestedNames)
    let matched = allCals.filter { nameSet.contains($0.title) }
    let foundNames = Set(matched.map { $0.title })
    let missing = requestedNames.filter { !foundNames.contains($0) }

    var eventsJson: [[String: Any]] = []
    if !matched.isEmpty {
        let now = Date()
        let future = now.addingTimeInterval(TimeInterval(daysAhead * 86_400))
        let predicate = store.predicateForEvents(withStart: now, end: future, calendars: matched)
        let events = store.events(matching: predicate)
        for e in events {
            let loc = (e.location?.isEmpty == false) ? (e.location as Any) : NSNull()
            eventsJson.append([
                "id": e.eventIdentifier ?? "",
                "title": e.title ?? "",
                "startDate": formatter.string(from: e.startDate),
                "endDate": formatter.string(from: e.endDate),
                "allDay": e.isAllDay,
                "location": loc,
                "calendarName": e.calendar.title,
                "recurring": e.hasRecurrenceRules,
            ])
        }
    }
    emit(["events": eventsJson, "missing": missing])

default:
    fail("unknown mode: \(mode). Expected 'calendars' or 'events'.")
}
