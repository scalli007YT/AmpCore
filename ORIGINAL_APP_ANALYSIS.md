# Original C# AMP Controller - Network Architecture Analysis

Based on reverse engineering of the original CVR AMP Controller C# application (上位机控制程序1), here's how the original software handled network scanning, amp waking, and discovery.

## 1. Network Discovery & Scanning Strategy

### Initial Setup (UDP.initUDP2())
The original app uses a **multi-interface approach**:

```csharp
public static void initUDP2()
{
    FireWallHelp.AllowAppUseFirewall();
    string[] ips = UDP_tool.getIPs();  // Get all local IPv4 interfaces
    
    if (ips.Length >= 1)
    {
        foreach (string udpclient in ips)
        {
            UDP.setUDPClient(udpclient);
            UDP.Sendrefrash();           // Send broadcast on each interface
            MainWindow.Sleep(200);        // Wait 200ms for responses
            
            if (UDP.refresh_MacList.Count > 0)
            {
                return;  // Found amps, use this interface
            }
        }
    }
}
```

**Key Differences from Current Implementation:**
- ✅ Tries **multiple network interfaces** (not just the first one)
- ✅ Waits **200ms** between broadcasts (current: instant)
- ✅ **Stops after first successful interface** (current: only uses primary interface)

### Broadcast Discovery (Sendrefrash())
The app sends a **broadcast packet to 255.255.255.255:45455** with Function_code 0 (BASIC_INFO):

```csharp
public static void Sendrefrash()
{
    UDP.refresh_IP_List.Clear();
    Struct_test.structHeader structHeader = new Struct_test.structHeader
    {
        Head = 85,           // 0x55
        Link = 0,
        Function_code = 0,   // BASIC_INFO request
        Status_code = 2,     // Request status
        chx = 0,
        segment = 0
    };
    
    // Send to broadcast address 255.255.255.255:45455
    UDP.UDP_Receive.Send(UDP.SendData, UDP.SendData.Length, UDP.BROADCAST_IP);
}
```

**Broadcast IP Configuration:**
```csharp
public static IPEndPoint BROADCAST_IP = new IPEndPoint(
    IPAddress.Parse("255.255.255.255"), 
    45455
);
```

---

## 2. Device Discovery & Tracking

### MAC Address Based Discovery
The original app tracks discovered devices by **MAC address**:

```csharp
public static List<string> refresh_MacList = new List<string>();

// When a response is received:
private static void ProcessDiscovery(Basic_Info basic, string ip)
{
    string text = UDP_tool.MACbyteToHexStr(basic.Local_mac_address);
    
    if (text.Equals("00:00:00:00:00:00"))
    {
        return;  // Skip invalid MACs
    }
    
    if (!UDP.refresh_MacList.Contains(text))
    {
        UDP.refresh_MacList.Add(text);  // Track discovered MACs
    }
    
    // Add to device table
    Device_Info device_Info = MainWindow.main_Table.addDeives(basic, ip, text);
    if (device_Info != null)
    {
        device_Info.IpMode = num;
    }
}
```

### Periodic Refresh (Refrash() - Note the typo is in the original)
The app uses a **4-second timer** for periodic discovery:

```csharp
UDP.TimerRefresh = new System.Timers.Timer();
UDP.TimerRefresh.Interval = 4000.0;  // 4 seconds
UDP.TimerRefresh.Elapsed += new ElapsedEventHandler(UDP.refrash);
UDP.TimerRefresh.Start();

public static void refrash()
{
    UDP.refresh_step++;
    
    if (UDP.refresh_step == 1)
    {
        UDP.refresh_MacList.Clear();  // Clear old MACs
    }
    
    UDP.Sendrefrash();  // Broadcast discovery
    MainWindow.Sleep(1000);  // Wait 1 second for responses
    
    if (UDP.refresh_step < 1)
    {
        return;
    }
    
    UDP.refresh_step = 0;
    
    // Mark amps as offline if not in latest discovery
    try
    {
        foreach (Device_Info device_Info in MainWindow.main_Table.Main_DeivesData)
        {
            if (!UDP.refresh_MacList.Contains(device_Info.MAC) && 
                device_Info.Online && 
                !device_Info.IP.StartsWith("RS"))
            {
                device_Info.Online = false;
                device_Info.State_num = -1;
            }
        }
    }
    catch { }
}
```

---

## 3. Amp Waking & Polling Strategy

### Heartbeat Polling (FC=6)
The app uses **Function_code 6 (HEARTBEAT)** for continuous polling (~140ms intervals):

```csharp
public static void queryT_V_A()
{
    int num = 0;
    for (;;)
    {
        if (!UDP.isRefresh || QuanJu.TestFalge || 
            (!MainWindow.cw.IsVisible && !Uesr.IsFlow("A")))
        {
            num = 0;
            Thread.Sleep(120);  // Sleep when not needed
        }
        else
        {
            // Build HEARTBEAT query
            Struct_test.structHeader structHeader = new Struct_test.structHeader
            {
                Head = 85,           // 0x55
                Link = 0,
                Function_code = 6,   // HEARTBEAT
                Status_code = 2,     // Request status
                chx = 0,             // Generic heartbeat
                segment = 0
            };
            
            // Send heartbeat query
            byte[] array = UDP_tool.byteMerger(
                UDP_tool.StructToBytes(structHeader), 
                UDP_tool.getCheckCode(UDP_tool.StructToBytes(structHeader))
            );
            
            // Build network frame and send
            UDP.SendData = UDP_tool.byteMerger(
                UDP_tool.StructToBytes(new Struct_test.networkData 
                {
                    data_flag = 55555,
                    packets_count = 1,
                    packets_lastlenth = (short)array.Length,
                    packets_stepcount = 1,
                    data_state = 0
                }), 
                array
            );
            
            UDP.UDP_Receive.Send(UDP.SendData, UDP.SendData.Length, UDP.SEND_IP);
        }
    }
}
```

### Polling Intervals
- **Discovery/Refresh**: 4 seconds (timer interval)
- **Heartbeat polling**: ~140ms loop with 120ms sleep when idle
- **Broadcast timeout wait**: 1 second (1000ms)
- **Inter-broadcast delay**: 200ms between interface attempts

---

## 4. Retransmission Strategy

The original app implements **3-retry logic** for critical commands:

```csharp
public static void send(Struct_test.structHeader header, object body)
{
    // ... frame construction ...
    
    int num2 = 0;
    
    do
    {
        UDP.SendData = UDP_tool.byteMerger(
            UDP_tool.StructToBytes(networkData), 
            array
        );
        
        UDP.UDP_Receive.Send(UDP.SendData, UDP.SendData.Length, UDP.SEND_IP);
        
        if (UDP_tool.outTime(1.0, UDP.SEND_IP.Address.ToString()))
        {
            break;  // Got response, stop retrying
        }
        
        num2++;  // Increment retry counter
    }
    while (num2 < 3);  // Retry up to 3 times
    
    if (num2 >= 3)
    {
        UDP.isSendSuccess = false;
    }
    else
    {
        UDP.isSendSuccess = true;
    }
}
```

---

## 5. Network Configuration & Binding

### Firewall & Network Setup
```csharp
public static void initUDP()
{
    UDP.setUDPIp(UDP_tool.getIPAddress());
    UDP.setSendIP(UDP.getUDPIp());
    UDP.setReceiveIP(UDP.getUDPIp());
    
    try
    {
        UDP.UDP_Receive = new UdpClient(UDP.UDP_IP);  // Bind to local IP
    }
    catch (Exception ex)
    {
        MainWindow.TipMessage(1, ex.Message);
        Environment.Exit(0);  // Fail fast if network setup fails
    }
    
    // Start receive thread
    UDP.Receive_Thread = new Thread(new ThreadStart(UDP.ReceiveMessage));
    UDP.Receive_Thread.Start();
    
    // Start heartbeat polling thread
    UDP.Refresh_Thread = new Thread(new ThreadStart(UDP.queryT_V_A));
    UDP.Refresh_Thread.Start();
    
    // Allow firewall
    FireWallHelp.AllowAppUseFirewall();
}
```

### Receive Thread
```csharp
public static void ReceiveMessage()
{
    try
    {
        for (;;)
        {
            // Blocking receive on UDP socket
            byte[] array = UDP.UDP_Receive.Receive(ref UDP.RECEIVE_IP);
            string ip = UDP.RECEIVE_IP.Address.ToString();
            
            // Process the response...
        }
    }
    catch (Exception)
    {
        // Retry on error
        goto IL_00;  // Jump back to start
    }
}
```

---

## 6. Key Differences from Current Implementation

| Aspect | Original App | Current TypeScript App |
|--------|-------------|----------------------|
| **Discovery Method** | Broadcast to 255.255.255.255 | ARP table lookup |
| **Polling Interval** | ~140ms heartbeat (FC=6) | 5000ms full query (FC=0 + FC=71) |
| **Multi-interface Support** | Yes (tries all interfaces) | Only primary interface |
| **Waking Mechanism** | Broadcast reaches all amps automatically | ARP ping + broadcast |
| **Retry Logic** | 3 retries per command | 3 retries in socket binding |
| **Refresh Frequency** | 4 seconds (refresh_MacList clear) | 5 seconds (configurable) |
| **Receive Mode** | Blocking thread on socket | Timeout-based with promise |
| **MAC Tracking** | List-based (refresh_MacList) | Set/map for quick lookup |
| **Idle Sleep** | 120ms when inactive | Polling stops when not polling |

---

## 7. Recommended Improvements for Current App

### 1. Add Multi-Interface Support
```typescript
// Try each network interface until one finds amps
for (const ipAddress of ipAddresses) {
  const device = new CvrAmpDevice(ipAddress);
  const amps = await scanNetwork(ipAddress);
  if (amps.length > 0) {
    // Use this interface
    break;
  }
}
```

### 2. Implement FC=6 HEARTBEAT Polling
Replace the current 5000ms BASIC_INFO queries with 140ms HEARTBEAT queries:
- More responsive to amp state changes
- Lower network load
- Real-time status updates

### 3. Use Broadcast Instead of ARP
```typescript
// Send to 255.255.255.255:45455 instead of relying on ARP
const broadcastIp = "255.255.255.255";
await device.queryBasicInfo(broadcastIp);
```

### 4. Implement MAC-Based Tracking
```typescript
const discoveredMacs = new Set<string>();

function processDiscovery(mac: string) {
  if (!discoveredMacs.has(mac)) {
    discoveredMacs.add(mac);
    // Mark amp as discovered
  }
}

// Periodically clear and re-discover
setInterval(() => {
  discoveredMacs.clear();
  sendBroadcast();
}, 4000);  // 4 second refresh
```

### 5. Implement Graceful Degradation
- Try broadcast first (fastest)
- Fall back to ARP if broadcast fails
- Fall back to IP ping if ARP fails
- Support multiple interfaces

---

## Network Data Structure

The original app uses this packet structure:

```
[0-9]    NetworkData (10 bytes)
  [0-3]    data_flag = 0x0000D903 (55555)
  [4]      packets_count
  [5-6]    packets_lastlenth (LE)
  [7]      packets_stepcount
  [8]      data_state
  [9]      machine_mode (reserved)

[10-19]  StructHeader (10 bytes)
  [10]     head = 0x55
  [11]     function_code (0=BASIC_INFO, 6=HEARTBEAT, etc.)
  [12]     status_code (1=write, 2=request, 3=response)
  [13]     chx (channel index 0-3)
  [14]     link
  [15]     inOutFlag
  [16]     segment
  [17-19]  reserved

[20+]    Payload (variable)

[end-2]  Checksum (3 bytes)
  [0]    length_hi = (length + 3) >> 8
  [1]    length_lo = (length + 3) & 0xFF
  [2]    checksum = (sum of all bytes) & 0xFF
```

---

## Conclusion

The original C# application uses a **robust, multi-layered approach** to network discovery:

1. **Automatic Discovery**: Broadcast-based (everyone gets found)
2. **Continuous Polling**: Lightweight heartbeat queries
3. **Adaptive Interfaces**: Tries multiple network adapters
4. **State Tracking**: Maintains MAC-based device list with online/offline status
5. **Graceful Handling**: Threads, timeouts, and retry logic

The current TypeScript implementation is on the right track with ARP lookup, but would benefit from:
- Adding broadcast fallback
- Switching to FC=6 HEARTBEAT for polling
- Implementing multi-interface support
- Using the original 4-second discovery interval

