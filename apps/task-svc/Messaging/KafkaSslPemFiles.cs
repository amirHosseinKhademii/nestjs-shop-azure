using System.Security.Cryptography;
using System.Text;

namespace ShopNest.TaskSvc.Messaging;

/// <summary>
/// Confluent/librdkafka expects PEM material as file paths, not inline
/// strings. We cache stable paths keyed by a hash of the PEM content so
/// repeated startups don't churn temp files unnecessarily.
/// </summary>
internal static class KafkaSslPemFiles
{
    private static readonly object Gate = new();
    private static readonly Dictionary<string, string> Cache = new(StringComparer.Ordinal);

    /// <summary>
    /// Normalises PEM material loaded from <c>.env</c>: strips wrapping quotes,
    /// turns literal <c>\n</c> sequences into real newlines (single-line env dumps),
    /// and normalises CRLF → LF so BEGIN/END markers match what OpenSSL/librdkafka expect.
    /// </summary>
    public static string NormalizePem(string raw)
    {
        var s = raw.Trim();
        if (s.Length >= 2 && s[0] == '"' && s[^1] == '"')
        {
            s = s[1..^1].Trim();
        }

        s = s.Replace("\r\n", "\n", StringComparison.Ordinal);
        // DotEnv single-line escapes (still seen in some tooling chains)
        if (s.Contains('\\') && !s.Contains('\n', StringComparison.Ordinal))
        {
            s = s.Replace("\\n", "\n", StringComparison.Ordinal);
        }

        return s.Trim();
    }

    public static string WriteOnce(string prefix, string pemContent)
    {
        var normalized = NormalizePem(pemContent);
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(normalized)))
            .ToLowerInvariant()[..16];
        var cacheKey = $"{prefix}:{hash}";
        lock (Gate)
        {
            if (Cache.TryGetValue(cacheKey, out var existing))
            {
                return existing;
            }

            var dir = Path.Combine(Path.GetTempPath(), "shop-nest-task-svc-kafka");
            Directory.CreateDirectory(dir);
            var path = Path.Combine(dir, $"{prefix}-{hash}.pem");
            File.WriteAllText(path, normalized);
            Cache[cacheKey] = path;
            return path;
        }
    }
}
