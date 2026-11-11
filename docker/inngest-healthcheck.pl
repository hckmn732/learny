#!/usr/bin/env perl
# Container healthcheck for the Inngest Dev Server (SPEC-008).
# The image ships neither curl nor wget; Perl's core IO::Socket::INET is enough.
use strict;
use warnings;
use IO::Socket::INET;

my $socket = IO::Socket::INET->new(
  PeerAddr => '127.0.0.1',
  PeerPort => 8288,
  Timeout  => 2,
) or exit 1;

print $socket "GET /health HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
local $/;
my $response = <$socket> // '';
exit($response =~ m{^HTTP/\S+ 200} ? 0 : 1);
