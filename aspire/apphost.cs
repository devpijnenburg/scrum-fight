#:sdk Aspire.AppHost.Sdk@13.6.4
#:property AspireUseCliBundle=true
#:package Aspire.Hosting.JavaScript@13.6.4
#:package Aspire.Hosting.PostgreSQL@13.6.4

// Lokale ontwikkelomgeving: start met `aspire run` of `dotnet run apphost.cs` in deze map.

var builder = DistributedApplication.CreateBuilder(args);

var jwtSecret = builder.AddParameter("jwt-secret",
    new GenerateParameterDefault { MinLength = 32, Special = false }, secret: true, persist: true);

var postgres = builder.AddPostgres("postgres")
    .WithImageTag("16-alpine")
    .WithDataVolume("scrum-fight-postgres")
    .WithLifetime(ContainerLifetime.Persistent);
var db = postgres.AddDatabase("planningpoker");

var mailpit = builder.AddContainer("mailpit", "axllent/mailpit")
    .WithHttpEndpoint(targetPort: 8025, name: "http")
    .WithEndpoint(targetPort: 1025, name: "smtp", scheme: "tcp");
var smtp = mailpit.GetEndpoint("smtp");

var backend = builder.AddNodeApp("backend", "../backend", "server.js")
    .WithNpm()
    .WithHttpEndpoint(env: "PORT")
    .WithEnvironment("DATABASE_URL", db.Resource.UriExpression)
    .WithEnvironment("JWT_SECRET", jwtSecret)
    .WithEnvironment("SMTP_HOST", smtp.Property(EndpointProperty.Host))
    .WithEnvironment("SMTP_PORT", smtp.Property(EndpointProperty.Port))
    .WithEnvironment("SMTP_STARTTLS", "false")
    .WithEnvironment("SMTP_FROM", "noreply@scrumfight.local")
    .WaitFor(db)
    .WaitFor(mailpit);

// Zelfde nginx-image en -config als in productie; public/ wordt live gemount
var frontend = builder.AddContainer("frontend", "nginx", "1.30-alpine")
    .WithBindMount("../frontend/public", "/usr/share/nginx/html", isReadOnly: true)
    .WithBindMount("../frontend/nginx.conf", "/etc/nginx/templates/default.conf.template", isReadOnly: true)
    .WithHttpEndpoint(port: 8088, targetPort: 80)
    .WithEnvironment("BACKEND_URL", backend.GetEndpoint("http"))
    .WithExternalHttpEndpoints()
    .WaitFor(backend);

backend.WithEnvironment("BASE_URL", frontend.GetEndpoint("http"));

builder.Build().Run();
