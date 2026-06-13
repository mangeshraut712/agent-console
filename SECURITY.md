# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 1.2.x   | Yes       |
| 1.1.x   | Yes       |
| < 1.1   | No        |

## Reporting a vulnerability

Please **do not** open public GitHub issues for security problems.

Email **mangeshraut712@gmail.com** with:

- Description of the issue and potential impact
- Steps to reproduce
- Affected version / commit

We aim to acknowledge within 48 hours.

## Scope

This project is a **debug UI** that connects to WebSocket backends you control. It does not store credentials server-side. Treat `NEXT_PUBLIC_WS_URL` and exported trace JSON as sensitive if your agent context includes private data.
