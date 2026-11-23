using AssetFlow.Agent;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using System.Net;

var now = DateTimeOffset.Parse("2026-09-11T12:00:00Z");
var health = new AgentHealth();
var checks = 0;
void Expect(AgentHealthSnapshot? snapshot, DateTimeOffset at, AgentHealthColor expected)
{
    var actual = AgentHealth.Evaluate(snapshot, at).Color;
    if (actual != expected) throw new Exception($"Expected {expected}, got {actual}");
    checks++;
}
Expect(null, now, AgentHealthColor.Waiting);
Expect(health.Snapshot(now), now, AgentHealthColor.Waiting);
health.Failure("등록", "HTTP 401");
Expect(health.Snapshot(now), now, AgentHealthColor.Error);
health.Success("등록", now);
Expect(health.Snapshot(now), now, AgentHealthColor.Healthy);
health.Failure("인벤토리", "수집 실패");
health.Success("하트비트", now.AddSeconds(1));
Expect(health.Snapshot(now), now, AgentHealthColor.Error); // unrelated success cannot hide failure
health.Success("인벤토리", now.AddSeconds(2));
Expect(health.Snapshot(now), now, AgentHealthColor.Healthy);
health.Failure("업데이트", "무결성 오류");
health.Success("하트비트", now.AddSeconds(3));
Expect(health.Snapshot(now), now, AgentHealthColor.Error);
health.Success("업데이트", now.AddSeconds(4));
Expect(health.Snapshot(now), now, AgentHealthColor.Healthy);
Expect(health.Snapshot(now), now.AddSeconds(46), AgentHealthColor.Waiting); // dead service
Expect(health.Snapshot(now.AddMinutes(13)), now.AddMinutes(13), AgentHealthColor.Warning);
Expect(health.Snapshot(now.AddMinutes(2)), now, AgentHealthColor.Waiting); // clock moved backwards
var serialized = JsonSerializer.Serialize(health.Snapshot(now));
Expect(JsonSerializer.Deserialize<AgentHealthSnapshot>(serialized), now, AgentHealthColor.Healthy);
Parallel.For(0, 1000, i => { health.Success("heartbeat", now); health.Failure("inventory", "failed"); _ = health.Snapshot(now); });
Expect(health.Snapshot(now), now, AgentHealthColor.Error);
Console.WriteLine($"PASS: {checks} health-state checks, including concurrency and JSON round trip");

var directory = Path.Combine(Path.GetTempPath(), "assetflow-log-tests-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(directory);
try
{
    var old = Path.Combine(directory, "communication-20000101.log");
    File.WriteAllText(old, "expired");
    File.SetLastWriteTime(old, DateTime.Now.AddDays(-40));
    using var provider = new DailyFileLoggerProvider(directory);
    using var factory = LoggerFactory.Create(b => b.AddProvider(provider));
    var logger = factory.CreateLogger<AgentCommunicationHandler>();
    foreach (var code in new[] { HttpStatusCode.OK, HttpStatusCode.NoContent, HttpStatusCode.Unauthorized, HttpStatusCode.InternalServerError })
    {
        using var handler = new AgentCommunicationHandler(logger) { InnerHandler = new StubHandler((_, _) => Task.FromResult(new HttpResponseMessage(code))) };
        using var client = new HttpClient(handler);
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://example.invalid/api/v1/agents/heartbeat?secret=DO_NOT_LOG_QUERY");
        request.Headers.Add("Authorization", "Bearer DO_NOT_LOG_TOKEN");
        request.Content = new StringContent("DO_NOT_LOG_BODY");
        using var response = await client.SendAsync(request);
        if (response.StatusCode != code) throw new Exception("Handler changed response");
    }
    foreach (var failure in new Exception[] { new HttpRequestException("DO_NOT_LOG_EXCEPTION"), new TaskCanceledException("DO_NOT_LOG_CANCEL") })
    {
        using var handler = new AgentCommunicationHandler(logger) { InnerHandler = new StubHandler((_, _) => Task.FromException<HttpResponseMessage>(failure)) };
        using var client = new HttpClient(handler);
        try { await client.GetAsync("https://example.invalid/api/v1/agents/updates/latest"); throw new Exception("Expected failure"); }
        catch (Exception e) when (e is HttpRequestException or OperationCanceledException) { }
    }
    var logPath = Path.Combine(directory, $"communication-{DateTime.Now:yyyyMMdd}.log");
    var text = File.ReadAllText(logPath);
    if (text.Contains("DO_NOT_LOG") || text.Contains("example.invalid")) throw new Exception("Sensitive data leaked");
    foreach (var expected in new[] { "HTTP_START", "status=200", "status=204", "status=401", "status=500", "HTTP_FAILED", "CANCELLED_OR_TIMEOUT", "durationMs=" })
        if (!text.Contains(expected)) throw new Exception("Missing log evidence " + expected);
    if (File.Exists(old)) throw new Exception("Old log retained");
    using (var large = new FileStream(logPath, FileMode.Open)) large.SetLength(10 * 1024 * 1024);
    logger.LogInformation("rotation-check");
    if (!File.Exists(logPath.Replace(".log", ".1.log")) || !File.ReadAllText(logPath).Contains("rotation-check")) throw new Exception("Rotation failed");
    var blocked = Path.Combine(directory, "not-a-directory");
    File.WriteAllText(blocked, "blocked");
    using var failingProvider = new DailyFileLoggerProvider(blocked);
    failingProvider.CreateLogger("test").LogInformation("Must not throw on log I/O failure");
    Console.WriteLine("PASS: HTTP 200/204/401/500, network/cancellation logs, secret redaction, retention, rotation, log I/O isolation");
}
finally { Directory.Delete(directory, true); }

// CR-018: service account names are never reported as the PC user; WTS fallback is used when WMI has no console user.
string? Expect2(string? wmi, string? wts) => SessionUsers.Resolve(wmi, () => wts);
if (Expect2("CORP\\jkim", null) != "CORP\\jkim") throw new Exception("WMI user must win");
if (Expect2(null, "CORP\\lee") != "CORP\\lee") throw new Exception("WTS fallback");
if (Expect2("SYSTEM", "PC01\\user") != "PC01\\user") throw new Exception("SYSTEM must be ignored");
if (Expect2("NT AUTHORITY\\SYSTEM", null) != null) throw new Exception("service account must be null");
if (Expect2("CORP\\PC01$", null) != null) throw new Exception("machine account must be null");
if (Expect2("  ", "") != null) throw new Exception("blank must be null");
if (Expect2(null, null) != null) throw new Exception("nobody logged on must be null");
// CR-S01: only SYSTEM / Administrators may own the data folder.
if (!ConfigProtection.IsTrustedOwnerSid("S-1-5-18")) throw new Exception("SYSTEM owner");
if (!ConfigProtection.IsTrustedOwnerSid("S-1-5-32-544")) throw new Exception("Administrators owner");
if (ConfigProtection.IsTrustedOwnerSid("S-1-5-21-1-2-3-1001")) throw new Exception("standard user owner must be untrusted");
if (ConfigProtection.IsTrustedOwnerSid(null)) throw new Exception("null owner must be untrusted");
// A Users ACE with write/append/delete is the V-01 condition; read-only Users and any Administrators ACE are fine.
var W = System.Security.AccessControl.FileSystemRights.WriteData; var RX = System.Security.AccessControl.FileSystemRights.ReadAndExecute; var FC = System.Security.AccessControl.FileSystemRights.FullControl;
if (!ConfigProtection.GrantsWrite(true, "S-1-5-32-545", W)) throw new Exception("Users write must be flagged");
if (!ConfigProtection.GrantsWrite(true, "S-1-5-11", System.Security.AccessControl.FileSystemRights.Delete)) throw new Exception("Authenticated Users delete must be flagged");
if (ConfigProtection.GrantsWrite(true, "S-1-5-32-545", RX)) throw new Exception("Users read-only is allowed");
if (ConfigProtection.GrantsWrite(true, "S-1-5-32-544", FC)) throw new Exception("Administrators full control is allowed");
if (ConfigProtection.GrantsWrite(false, "S-1-5-32-545", FC)) throw new Exception("Deny ACEs are not write grants");
Console.WriteLine("PASS: logged-on user resolution and data-folder owner policy");

// 0.2.13: monitor / keyboard / mouse parsing rules.
void Check(bool ok, string what) { if (!ok) throw new Exception("Peripheral: " + what); }
Check(Peripherals.DecodeWmiChars(new ushort[] { 68, 69, 76, 0, 0 }) == "DEL", "uint16[] chars stop at NUL");
Check(Peripherals.DecodeWmiChars(new ushort[] { 0, 0 }) == null && Peripherals.DecodeWmiChars(null) == null && Peripherals.DecodeWmiChars("x") == null, "empty/unknown char arrays");
Check(Peripherals.NormalizeSerial("0") == null && Peripherals.NormalizeSerial("0000") == null && Peripherals.NormalizeSerial(" CN0ABC123 ") == "CN0ABC123", "EDID serial placeholders");
Check(Peripherals.DiagonalInches(53, 30) == 24.0m && Peripherals.DiagonalInches(31, 17) == 13.9m, "diagonal inches");
Check(Peripherals.DiagonalInches(0, 0) == null && Peripherals.DiagonalInches(null, 30) == null, "TV/projector size unknown");
Check(Peripherals.VideoOutput(5) == "HDMI" && Peripherals.VideoOutput(10) == "DisplayPort" && Peripherals.VideoOutput(0x80000000L) == "Internal"
    && Peripherals.VideoOutput(11) == "Internal" && Peripherals.VideoOutput(0) == "VGA" && Peripherals.VideoOutput(4294967294L) == "Other" && Peripherals.VideoOutput(null) == null, "video output technology");
var mon = Peripherals.MonitorDevice(@"DISPLAY\DEL4123\5&2a7b1&0&UID4353_0", "DEL", "4123", "CN0ABC123", "DELL P2419H", 2021, 53, 30, 10);
Check(mon is { Type: "MONITOR", Name: "DELL P2419H", Manufacturer: "Dell", Model: "DEL4123", SerialNo: "CN0ABC123", Connection: "DisplayPort", ManufactureYear: 2021, SizeInches: 24.0m }, "external monitor");
var panel = Peripherals.MonitorDevice(@"DISPLAY\LGD0611\4&1a&0&UID8388688_0", null, null, "0", null, 0, 31, 17, 0x80000000L);
Check(panel is { Name: "LG Display 0611", Manufacturer: "LG Display", Model: "LGD0611", SerialNo: null, Connection: "Internal", ManufactureYear: null }, "laptop panel from instance name");
Check(Peripherals.MonitorDevice(null, "ZZZ", null, null, null, null, null, null, null).Manufacturer == "ZZZ", "unknown EDID vendor kept");
Check(Peripherals.IsVirtual(@"TERMINPUT_BUS\UMB\2&1"), "RDP keyboard is virtual");
Check(Peripherals.IsVirtual(@"ROOT\RDP_MOU\0000") && Peripherals.IsVirtual(@"VMBUS\{F8615163}") && Peripherals.IsVirtual(null), "RDP/Hyper-V/null are virtual");
Check(!Peripherals.IsVirtual(@"HID\VID_046D&PID_C52B&MI_00\7&1&0&0000"), "USB keyboard is physical");
Check(Peripherals.ParseInputDeviceId(@"HID\VID_046D&PID_C52B&MI_01&COL01\7&2B&0&0000", false) == ("046D", "C52B", "USB"), "USB VID/PID");
Check(Peripherals.ParseInputDeviceId(@"HID\{00001124-0000-1000-8000-00805F9B34FB}_VID&0002046D_PID&B023&COL01\9&1&0&0000", false) == ("046D", "B023", "Bluetooth"), "Bluetooth classic VID/PID");
Check(Peripherals.ParseInputDeviceId(@"HID\{00001812-0000-1000-8000-00805F9B34FB}_DEV_VID&02046D_PID&B01A_REV&0003_F1\A&1&0&0000", false) == ("046D", "B01A", "Bluetooth"), "BLE VID/PID");
Check(Peripherals.ParseInputDeviceId(@"ACPI\PNP0303\4&1&0", true).Connection == "Internal" && Peripherals.ParseInputDeviceId(@"ACPI\PNP0303\4&1&0", false).Connection == "PS/2", "ACPI keyboard: laptop internal vs desktop PS/2");
Check(Peripherals.ParseInputDeviceId(@"HID\VEN_SYNA&DEV_7DB5&COL01\5&1&0&0000", true) == (null, null, "Internal"), "I2C touchpad");
Check(Peripherals.IsPortableChassis(new[] { 10 }) && !Peripherals.IsPortableChassis(new[] { 3 }) && !Peripherals.IsPortableChassis(null), "chassis");
var kb1 = Peripherals.InputDevice("KEYBOARD", @"HID\VID_046D&PID_C52B&MI_00\7&1&0&0000", "HID Keyboard Device", "(Standard keyboards)", "USB Receiver", false)!;
var kb2 = Peripherals.InputDevice("KEYBOARD", @"HID\VID_046D&PID_C52B&MI_01&COL01\7&2&0&0000", "HID Keyboard Device", "(Standard keyboards)", "MX Keys", false)!;
Check(kb1 is { Manufacturer: "Logitech", Model: "VID_046D&PID_C52B", Connection: "USB", Name: "USB Receiver" }, "keyboard vendor from VID");
var ms = Peripherals.InputDevice("MOUSE", @"HID\VID_1A2C&PID_9999\7&3&0&0000", "HID-compliant mouse", "Microsoft", null, false)!;
Check(ms is { Name: "HID-compliant mouse", Manufacturer: "China Resource Semico" }, "generic name kept when nothing better");
var internalKb = Peripherals.InputDevice("KEYBOARD", @"ACPI\PNP0303\4&1&0", "Standard PS/2 Keyboard", "(Standard keyboards)", null, true)!;
Check(internalKb is { Name: "내장 키보드", Manufacturer: null, Model: null, Connection: "Internal" }, "laptop keyboard naming");
Check(Peripherals.InputDevice("MOUSE", @"TERMINPUT_BUS\UMB\2&1", "Terminal Server Mouse Driver", null, null, false) == null, "RDP mouse dropped");
var dedup = Peripherals.Deduplicate(new[] { kb1, kb2, ms, mon, panel });
Check(dedup.Count == 4 && dedup[0].Type == "MONITOR" && dedup[1].Type == "MONITOR" && dedup.Count(x => x.Type == "KEYBOARD") == 1, "HID collections of one keyboard collapse to one entry");
Check(dedup.Single(x => x.Type == "KEYBOARD").Name == "MX Keys", "dedupe keeps the specific name over the receiver name");
var many = Enumerable.Range(0, 100).Select(i => Peripherals.InputDevice("MOUSE", $@"HID\VID_{i:X4}&PID_0001\x", "m", null, null, false)!);
Check(Peripherals.Deduplicate(many).Count == 64, "server limit of 64 entries");
var json = JsonSerializer.Serialize(mon, new JsonSerializerOptions(JsonSerializerDefaults.Web));
Check(json.Contains("\"serialNo\":\"CN0ABC123\"") && json.Contains("\"sizeInches\":24.0") && json.Contains("\"type\":\"MONITOR\""), "camelCase JSON matches server contract");
Console.WriteLine("PASS: monitor EDID decoding, input device VID/PID/connection, virtual device filter, dedupe, JSON contract");

// 0.2.14: USB devices (present + previously connected) via SetupAPI.
Check(Peripherals.ErrorNote("peripherals", new InvalidOperationException("secret path C:\\x")) == "peripherals: InvalidOperationException", "error note carries no message text");
Check(UsbDevices.CleanDescription("@usb.inf,%usb.composite.devicedesc%;USB Composite Device") == "USB Composite Device" && UsbDevices.CleanDescription("SanDisk; Ultra") == "SanDisk; Ultra" && UsbDevices.CleanDescription(" ") == null, "INF description cleanup");
var utf16 = System.Text.Encoding.Unicode.GetBytes("Ultra Fit\0");
Check(UsbDevices.DecodeString(utf16, utf16.Length) == "Ultra Fit" && UsbDevices.DecodeString(null, 0) == null, "DEVPROP string");
var ft = BitConverter.GetBytes(new DateTime(2026, 11, 20, 1, 2, 3, DateTimeKind.Utc).ToFileTimeUtc());
Check(UsbDevices.DecodeFileTime(ft, 8) == new DateTimeOffset(2026, 11, 20, 1, 2, 3, TimeSpan.Zero) && UsbDevices.DecodeFileTime(new byte[8], 8) == null && UsbDevices.DecodeFileTime(ft, 4) == null, "DEVPROP FILETIME");
Check(UsbDevices.ParseInstanceId(@"USB\VID_0781&PID_5581\4C530001231122115172") == ("0781", "5581", "4C530001231122115172", null), "storage serial from instance");
Check(UsbDevices.ParseInstanceId(@"USB\VID_046D&PID_C52B&MI_01\7&2B&0&0001") == ("046D", "C52B", null, "01"), "interface entry, generated instance has no serial");
Check(UsbDevices.StorageSerial(@"USBSTOR\Disk&Ven_SanDisk&Prod_Ultra&Rev_1.00\4C530001231122115172&0") == "4C530001231122115172" && UsbDevices.StorageSerial(@"USBSTOR\Disk&Ven_X\7&1&0") == null, "USBSTOR serial");
Check(UsbDevices.Category("USB", "USBSTOR") == "STORAGE" && UsbDevices.Category("WPD", "WUDFRd") == "MOBILE" && UsbDevices.Category("Camera", "usbvideo") == "CAMERA"
    && UsbDevices.Category("Media", "usbaudio") == "AUDIO" && UsbDevices.Category("Net", "rndis") == "NETWORK" && UsbDevices.Category("USB", "usbprint") == "PRINTER"
    && UsbDevices.Category("SmartCardReader", "WUDFRd") == "SMARTCARD" && UsbDevices.Category("Ports", "usbser") == "SERIAL" && UsbDevices.Category("HIDClass", "HidUsb") == "INPUT"
    && UsbDevices.Category("USB", "usbccgp") == "OTHER", "categories");
DateTimeOffset T(int day) => new(2026, 11, day, 9, 0, 0, TimeSpan.Zero);
var raw = new[] {
    new UsbDevices.Raw(@"USB\ROOT_HUB30\4&1&0&0", "USB Root Hub (USB 3.0)", null, null, null, "USB", "USBHUB3", true, T(1), T(1), null),
    new UsbDevices.Raw(@"USB\VID_05E3&PID_0610\5&1&0&1", "Generic USB Hub", null, "USB2.0 Hub", null, "USB", "USBHUB3", true, T(1), T(1), null),
    new UsbDevices.Raw(@"USB\VID_0781&PID_5581\4C530001231122115172", "@usb.inf;USB Mass Storage Device", null, " SanDisk 3.2Gen1", "Compatible USB storage device", "USB", "USBSTOR", false, T(2), T(10), T(11)),
    new UsbDevices.Raw(@"USB\VID_046D&PID_085B\8B2D4C1F", "@usb.inf;USB Composite Device", null, "Logitech Webcam C925e", "(Standard USB Host Controller)", "USB", "usbccgp", true, T(3), T(20), null),
    new UsbDevices.Raw(@"USB\VID_046D&PID_085B&MI_00\7&1&0&0000", "USB Video Device", null, "Logitech Webcam C925e", null, "Camera", "usbvideo", true, T(3), T(21), null),
    new UsbDevices.Raw(@"USB\VID_046D&PID_085B&MI_02\7&1&0&0002", "USB Audio Device", null, null, null, "Media", "usbaudio", true, T(3), T(21), null),
    new UsbDevices.Raw(@"USB\VID_04E8&PID_6860\R5CT1234ABC", "@usb.inf;USB Composite Device", null, "SAMSUNG_Android", "Samsung", "USB", "usbccgp", false, T(4), T(5), T(5)),
    new UsbDevices.Raw(@"USB\VID_04E8&PID_6860&MI_00\7&9&0&0000", "Galaxy S23", "Galaxy S23", null, null, "WPD", "WUDFRd", false, T(4), T(5), T(5)),
    new UsbDevices.Raw(@"USB\VID_ABCD&PID_1234\6&3&0&4", null, null, null, null, null, null, null, null, null, null),
};
var usb = UsbDevices.Build(raw, new Dictionary<string, string> { ["4C530001231122115172"] = "SanDisk Ultra Fit USB Device" });
Check(usb.Count == 4, "hubs dropped, interfaces folded into parents (got " + usb.Count + ")");
Check(usb[0] is { Category: "CAMERA", Name: "Logitech Webcam C925e", Manufacturer: "Logitech", Present: true, SerialNo: "8B2D4C1F" } && usb[0].LastArrivalAt == T(21), "composite webcam: camera wins over audio, newest interface arrival");
var stick = usb.Single(x => x.VendorId == "0781");
Check(stick is { Category: "STORAGE", Name: "SanDisk Ultra Fit USB Device", Present: false, SerialNo: "4C530001231122115172", Manufacturer: "SanDisk" } && stick.LastRemovalAt == T(11) && stick.FirstInstallAt == T(2), "past USB stick with USBSTOR name and history times");
var phone = usb.Single(x => x.VendorId == "04E8");
Check(phone is { Category: "MOBILE", Name: "Galaxy S23", Manufacturer: "Samsung", Present: false }, "past phone named by its MTP function");
Check(usb.Last() is { Name: "USB ABCD:1234", Category: "OTHER", Present: null, SerialNo: null }, "unknown device keeps VID:PID name");
Check(usb.IndexOf(stick) < usb.IndexOf(phone), "past devices ordered by last arrival");
var bulk = Enumerable.Range(0, 400).Select(i => new UsbDevices.Raw($@"USB\VID_1111&PID_{i:X4}\S{i}", "Dev", null, null, null, "USB", "x", false, null, T(1), null));
Check(UsbDevices.Build(bulk).Count == UsbDevices.Limit, "300 device limit");
var usbJson = JsonSerializer.Serialize(usb[0], new JsonSerializerOptions(JsonSerializerDefaults.Web));
Check(usbJson.Contains("\"deviceId\":") && usbJson.Contains("\"lastArrivalAt\":\"2026-11-21T09:00:00+00:00\"") && usbJson.Contains("\"present\":true"), "USB JSON contract");
Console.WriteLine("PASS: USB present/past devices — instance parsing, categories, composite folding, hub filter, USBSTOR names, history times, ordering, limit, JSON");

// 0.2.15: cases observed on production PC DESKTOP-KJH (2026-11-23).
Check(Peripherals.NormalizeSerial("16843009") == null && Peripherals.NormalizeSerial("____________") == null && Peripherals.NormalizeSerial("GPUJCHA057271") == "GPUJCHA057271"
    && Peripherals.NormalizeSerial("1111") == null && Peripherals.NormalizeSerial("A") == "A", "serial placeholders (LG 0x01010101, label printer underscores)");
Check(UsbDevices.SanitizeName("Wired Keyboard ࠶00") == "Wired Keyboard 600" && UsbDevices.SanitizeName("갤럭시 탭") == "갤럭시 탭" && UsbDevices.SanitizeName("Pro\u0001 X") == "Pro X", "corrupted high byte restored, Hangul kept");
var samsung = new[] {
    new UsbDevices.Raw(@"USB\VID_04E8&PID_6860\R5KL807BR7L", "SAMSUNG_Android", null, null, "SAMSUNG Electronics Co., Ltd.", "USB", "dg_ssudbus", false, T(19), T(19), T(19), @"USB\VID_05E3&PID_0610\5&1&0&1"),
    new UsbDevices.Raw(@"USB\VID_04E8&PID_6860&Modem\6&A&0&0000", "SAMSUNG Mobile USB Modem #25", null, null, "SAMSUNG", "Modem", "Modem", false, T(19), T(19), T(19), @"USB\VID_04E8&PID_6860\R5KL807BR7L"),
    new UsbDevices.Raw(@"USB\VID_04E8&PID_6860&MI_01\6&B&0&0001", "Galaxy Tab A11+", "Galaxy Tab A11+", null, "Samsung", "WPD", "WUDFWpdMtp", false, T(19), T(19), T(19), @"USB\VID_04E8&PID_6860\R5KL807BR7L"),
    new UsbDevices.Raw(@"USB\VID_04E8&PID_6860&ADB\6&C&0&0002", "ADB Interface", null, null, "Samsung", "AndroidUsbDeviceClass", "WINUSB", false, T(19), T(19), T(19), @"USB\VID_04E8&PID_6860\R5KL807BR7L"),
    new UsbDevices.Raw(@"USB\VID_05E3&PID_0610\5&1&0&1", "Generic USB Hub", null, null, null, "USB", "USBHUB3", true, T(1), T(1), null, @"USB\ROOT_HUB30\4&1&0&0"),
    new UsbDevices.Raw(@"USB\VID_0000&PID_0002\5&9&0&3", "Unknown USB Device (Device Descriptor Request Failed)", null, null, null, "USB", null, false, T(7), T(7), T(7)),
    new UsbDevices.Raw(@"USB\VID_08A6&PID_0053\____________", "TOSHIBA B-EX4T1-T", null, null, "Microsoft", "USB", "usbprint", false, T(4), T(4), T(4)),
    new UsbDevices.Raw(@"USB\VID_045E&PID_07F8\6&1&0&2", "@usb.inf;USB Composite Device", null, "Wired Keyboard ࠶00", "(Standard USB Host Controller)", "USB", "usbccgp", true, T(1), T(11), null),
    new UsbDevices.Raw(@"USB\VID_12C9&PID_1017\6&2&0&3", "@usb.inf;USB Composite Device", null, "USB Gaming Mouse", null, "USB", "usbccgp", true, T(1), T(11), null),
    new UsbDevices.Raw(@"USB\VID_12C9&PID_1017&MI_00\7&3&0&0000", "USB Input Device", null, null, null, "HIDClass", "HidUsb", true, T(1), T(11), null, @"USB\VID_12C9&PID_1017\6&2&0&3"),
};
var real = UsbDevices.Build(samsung);
var tab = real.SingleOrDefault(x => x.VendorId == "04E8");
Check(tab is { Category: "MOBILE", Name: "Galaxy Tab A11+", Manufacturer: "Samsung", SerialNo: "R5KL807BR7L", Present: false }, "Samsung modem/MTP/ADB functions fold into one phone row (got " + real.Count(x => x.VendorId == "04E8") + ")");
Check(real.All(x => x.VendorId != "0000"), "descriptor-failed devices dropped");
Check(real.Single(x => x.VendorId == "08A6") is { Category: "PRINTER", Manufacturer: "Toshiba TEC", SerialNo: null }, "printer: INF provider Microsoft ignored, placeholder serial dropped");
Check(real.Single(x => x.VendorId == "045E").Name == "Wired Keyboard 600", "keyboard name restored");
Check(real.Single(x => x.VendorId == "12C9") is { Category: "INPUT", Name: "USB Gaming Mouse" } && real.Count == 4, "gaming mouse interface folded via parent");
var periph = Peripherals.Enrich(new[] {
    Peripherals.InputDevice("KEYBOARD", @"HID\VID_045E&PID_07F8&MI_00\7&1&0&0000", "알 수 없는 키보드", null, null, false)!,
    Peripherals.InputDevice("KEYBOARD", @"HID\VID_12C9&PID_1017&MI_01&COL01\7&2&0&0000", "알 수 없는 키보드", null, null, false)!,
    Peripherals.InputDevice("MOUSE", @"HID\VID_12C9&PID_1017&MI_00\7&3&0&0000", "HID 규격 마우스", "Microsoft", null, false)!,
}, real);
Check(periph.Count == 2, "gaming mouse's keyboard collection dropped (got " + periph.Count + ")");
Check(periph.Single(x => x.Type == "KEYBOARD") is { Name: "Wired Keyboard 600", Manufacturer: "Microsoft" }, "keyboard named from USB product");
Check(periph.Single(x => x.Type == "MOUSE") is { Name: "USB Gaming Mouse", Manufacturer: null }, "mouse named from USB, INF provider Microsoft dropped for non-Microsoft VID");
Console.WriteLine("PASS: production cases — Samsung bus-driver folding, descriptor failures, placeholders, corrupted names, Korean generic HID names, USB enrichment");

sealed class StubHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) => send(request, ct);
}
